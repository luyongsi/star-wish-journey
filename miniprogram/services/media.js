// services/media.js — 媒体上传/删除/获取临时URL
const { cloudPathTemplates, mediaLimits } = require('../config/index');

const MAX_RETRY = 2;

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
 * @returns {string}
 */
function _buildCloudPath(filePath, coupleId, checkInId, index) {
  const mediaType = _getMediaType(filePath);
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
 * @param {Array<string>} filePaths - 本地文件路径数组
 * @param {string} coupleId
 * @param {string} checkInId
 * @returns {Promise<Array<{ fileId: string, type: string }>>}
 */
async function uploadBatch(filePaths, coupleId, checkInId) {
  const results = [];
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const cloudPath = _buildCloudPath(filePath, coupleId, checkInId, i);
    try {
      const result = await uploadMedia(filePath, cloudPath);
      results.push({ fileId: result.fileId, type: result.type });
    } catch (err) {
      console.error('[media] 文件上传失败:', filePath, err);
      // 上传失败后清理已上传的文件
      await _cleanupFiles(results.map((r) => r.fileId));
      throw new Error('文件上传失败: ' + (err.errMsg || '未知错误'));
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
  deleteMedia,
  deleteBatch,
  getTempFileURL,
};
