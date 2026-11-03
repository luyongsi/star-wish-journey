// services/media.js — 媒体上传/删除/获取临时URL
const { cloudPathTemplates, mediaLimits } = require('../config/index');

const MAX_RETRY = 2;
const MB = 1024 * 1024;

/**
 * 获取文件大小（字节）
 * @param {string} filePath
 * @returns {Promise<number>}
 */
function _getFileSize(filePath) {
  return new Promise((resolve) => {
    try {
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (res) => resolve(res.size || 0),
        // 拿不到大小时不阻断流程，交给云端校验
        fail: () => resolve(0),
      });
    } catch (e) {
      resolve(0);
    }
  });
}

/**
 * 压缩图片（超阈值才压）
 * 基础库 2.13.0+ 支持 quality/compressedWidth
 * @param {string} filePath
 * @returns {Promise<string>} 压缩后的临时路径，失败时返回原路径
 */
function _compressImage(filePath) {
  return new Promise((resolve) => {
    if (!wx.compressImage) {
      resolve(filePath);
      return;
    }
    const options = {
      src: filePath,
      quality: mediaLimits.imageCompressQuality,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: (err) => {
        console.warn('[media] 图片压缩失败，使用原图:', err);
        resolve(filePath);
      },
    };
    if (wx.canIUse('compressImage.compressedWidth')) {
      options.compressedWidth = mediaLimits.imageMaxWidth;
    }
    wx.compressImage(options);
  });
}

/**
 * 压缩视频（超阈值才压）
 * 基础库 2.11.0+ 支持
 * @param {string} filePath
 * @returns {Promise<string>} 压缩后的临时路径，失败时返回原路径
 */
function _compressVideo(filePath) {
  return new Promise((resolve) => {
    if (!wx.compressVideo) {
      resolve(filePath);
      return;
    }
    wx.compressVideo({
      src: filePath,
      quality: mediaLimits.videoCompressQuality,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: (err) => {
        console.warn('[media] 视频压缩失败，使用原视频:', err);
        resolve(filePath);
      },
    });
  });
}

/**
 * 按需压缩单个媒体文件
 * 目标是让文件低于 wx.cloud.uploadFile 的 50MB 硬上限
 * @param {string} filePath
 * @param {'image'|'video'} type
 * @returns {Promise<string>} 可上传的文件路径
 * @throws {Error} 压缩后仍超过 50MB
 */
async function compressIfNeeded(filePath, type) {
  const size = await _getFileSize(filePath);
  const isVideo = type === 'video';
  const threshold = isVideo ? mediaLimits.videoCompressThreshold : mediaLimits.imageCompressThreshold;

  // 已在上限内且不大，不处理
  if (size > 0 && size <= threshold) {
    return filePath;
  }

  const compressedPath = isVideo
    ? await _compressVideo(filePath)
    : await _compressImage(filePath);

  const compressedSize = await _getFileSize(compressedPath);

  if (compressedSize > mediaLimits.maxUploadSize) {
    const err = new Error(
      `${isVideo ? '视频' : '图片'}压缩后仍有 ${(compressedSize / MB).toFixed(1)}MB，` +
      `超过云端 ${mediaLimits.maxUploadSize / MB}MB 上限，请换更短的素材`
    );
    err.code = 'MEDIA_TOO_LARGE';
    throw err;
  }

  return compressedPath;
}

/**
 * 获取文件扩展名
 * @param {string} filePath - 本地文件路径
 * @returns {string}
 */
function _getExt(filePath) {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'jpg';
}

/**
 * 根据文件类型判断是图片还是视频
 * @param {string} filePath
 * @returns {'image'|'video'}
 */
function _getMediaType(filePath) {
  const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv'];
  const ext = _getExt(filePath);
  return videoExts.includes(ext) ? 'video' : 'image';
}

/**
 * 生成云存储路径
 * @param {string} filePath - 本地文件路径
 * @param {string} coupleId
 * @param {string} checkInId
 * @param {number} index - 文件索引
 * @param {'image'|'video'} [type] - 显式指定类型（压缩后扩展名可能变化）
 * @returns {string}
 */
function _buildCloudPath(filePath, coupleId, checkInId, index, type) {
  const mediaType = type || _getMediaType(filePath);
  const ext = _getExt(filePath);
  const timestamp = Date.now();
  const template = cloudPathTemplates[mediaType];
  return template
    .replace('{coupleId}', coupleId)
    .replace('{checkInId}', checkInId)
    .replace('{timestamp}', timestamp)
    .replace('{index}', index)
    .replace('{ext}', ext);
}

/**
 * 上传单个媒体文件（含重试）
 * @param {string} filePath - 本地临时文件路径
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<string>} fileId
 */
function _uploadSingle(filePath, cloudPath) {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    function attempt() {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success(res) {
          resolve(res.fileID);
        },
        fail(err) {
          retryCount++;
          if (retryCount <= MAX_RETRY) {
            console.warn(`[media] 上传重试 ${retryCount}/${MAX_RETRY}:`, cloudPath);
            attempt();
          } else {
            reject(err);
          }
        },
      });
    }

    attempt();
  });
}

/**
 * 上传媒体文件
 * @param {string} filePath - 本地文件路径
 * @param {string} cloudPath - 云存储路径
 * @returns {Promise<{ fileId: string, type: string, filePath: string }>}
 */
async function uploadMedia(filePath, cloudPath) {
  const fileId = await _uploadSingle(filePath, cloudPath);
  const type = _getMediaType(filePath);
  return { fileId, type, filePath };
}

/**
 * 批量上传媒体文件
 * 逐个压缩后上传，单个失败会清理已上传文件并中断
 * @param {Array<string>} filePaths - 本地文件路径数组
 * @param {string} coupleId
 * @param {string} checkInId
 * @param {Function} [onProgress] - 进度回调 (done, total)
 * @returns {Promise<Array<{ fileId: string, type: string }>>}
 */
async function uploadBatch(filePaths, coupleId, checkInId, onProgress) {
  const results = [];
  const total = filePaths.length;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const type = _getMediaType(filePath);
    try {
      // 超过阈值先压缩，避免撞上云端 50MB 硬上限
      const uploadPath = await compressIfNeeded(filePath, type);
      const cloudPath = _buildCloudPath(uploadPath, coupleId, checkInId, i, type);
      const result = await uploadMedia(uploadPath, cloudPath);
      // type 以原始文件为准（压缩后扩展名可能变化）
      results.push({ fileId: result.fileId, type });
      if (typeof onProgress === 'function') {
        onProgress(i + 1, total);
      }
    } catch (err) {
      console.error('[media] 文件上传失败:', filePath, err);
      // 上传失败后清理已上传的文件
      await _cleanupFiles(results.map((r) => r.fileId));
      throw err;
    }
  }
  return results;
}

/**
 * 清理已上传的文件（写记录失败后异步清理）
 * @param {Array<string>} fileIds
 */
async function _cleanupFiles(fileIds) {
  if (!fileIds || fileIds.length === 0) return;
  try {
    await wx.cloud.deleteFile({ fileList: fileIds });
  } catch (err) {
    console.error('[media] 清理文件失败:', err);
  }
}

/**
 * 删除媒体文件
 * @param {string} fileId - 云文件ID
 * @returns {Promise<void>}
 */
async function deleteMedia(fileId) {
  if (!fileId) return;
  try {
    await wx.cloud.deleteFile({ fileList: [fileId] });
  } catch (err) {
    console.error('[media] 删除文件失败:', fileId, err);
  }
}

/**
 * 批量删除媒体文件
 * @param {Array<string>} fileIds
 * @returns {Promise<void>}
 */
async function deleteBatch(fileIds) {
  if (!fileIds || fileIds.length === 0) return;
  try {
    await wx.cloud.deleteFile({ fileList: fileIds });
  } catch (err) {
    console.error('[media] 批量删除文件失败:', err);
  }
}

/**
 * 获取临时文件URL
 * @param {Array<string>} fileIds
 * @returns {Promise<Array<{ fileID: string, tempFileURL: string }>>}
 */
function getTempFileURL(fileIds) {
  return new Promise((resolve, reject) => {
    if (!fileIds || fileIds.length === 0) {
      resolve([]);
      return;
    }
    wx.cloud.getTempFileURL({
      fileList: fileIds,
      success(res) {
        resolve(res.fileList);
      },
      fail(err) {
        console.error('[media] 获取临时URL失败:', err);
        reject(err);
      },
    });
  });
}

module.exports = {
  uploadMedia,
  uploadBatch,
  compressIfNeeded,
  deleteMedia,
  deleteBatch,
  getTempFileURL,
};
