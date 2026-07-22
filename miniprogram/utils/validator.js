// utils/validator.js — 输入校验：愿望标题、打卡备注、贴贴码等

/**
 * 校验愿望标题（1-30字）
 * @param {string} title
 * @returns {{ valid: boolean, message: string }}
 */
function validateWishTitle(title) {
  if (!title || typeof title !== 'string') {
    return { valid: false, message: '请输入愿望标题' };
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: '愿望标题不能为空' };
  }
  if (trimmed.length > 30) {
    return { valid: false, message: '愿望标题不能超过30个字' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验愿望描述（可选，≤200字）
 * @param {string} [description]
 * @returns {{ valid: boolean, message: string }}
 */
function validateWishDescription(description) {
  if (!description) return { valid: true, message: '' };
  if (description.length > 200) {
    return { valid: false, message: '愿望描述不能超过200个字' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验打卡备注（≤500字）
 * @param {string} [note]
 * @returns {{ valid: boolean, message: string }}
 */
function validateCheckInNote(note) {
  if (!note) return { valid: true, message: '' };
  if (note.length > 500) {
    return { valid: false, message: '打卡备注不能超过500个字' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验贴贴码（6位纯数字）
 * @param {string} code
 * @returns {{ valid: boolean, message: string }}
 */
function validatePairCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, message: '请输入贴贴码' };
  }
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, message: '贴贴码应为6位数字' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验分类值
 * @param {string} category
 * @returns {{ valid: boolean, message: string }}
 */
function validateCategory(category) {
  const validCategories = ['food', 'travel', 'sport', 'movie', 'home', 'other'];
  if (!category || !validCategories.includes(category)) {
    return { valid: false, message: '请选择有效的分类' };
  }
  return { valid: true, message: '' };
}

/**
 * 校验昵称（1-20字）
 * @param {string} nickName
 * @returns {{ valid: boolean, message: string }}
 */
function validateNickName(nickName) {
  if (!nickName || typeof nickName !== 'string') {
    return { valid: false, message: '请输入昵称' };
  }
  const trimmed = nickName.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: '昵称不能为空' };
  }
  if (trimmed.length > 20) {
    return { valid: false, message: '昵称不能超过20个字' };
  }
  return { valid: true, message: '' };
}

/**
 * 综合校验愿望创建参数
 * @param {Object} params - { title, description, category }
 * @returns {{ valid: boolean, message: string }}
 */
function validateWishCreate(params) {
  const titleCheck = validateWishTitle(params.title);
  if (!titleCheck.valid) return titleCheck;

  const descCheck = validateWishDescription(params.description);
  if (!descCheck.valid) return descCheck;

  const catCheck = validateCategory(params.category);
  if (!catCheck.valid) return catCheck;

  return { valid: true, message: '' };
}

/**
 * 综合校验打卡创建参数
 * @param {Object} params - { wishId, note, mediaList }
 * @returns {{ valid: boolean, message: string }}
 */
function validateCheckInCreate(params) {
  if (!params.wishId) {
    return { valid: false, message: '缺少愿望ID' };
  }
  const noteCheck = validateCheckInNote(params.note);
  if (!noteCheck.valid) return noteCheck;

  if (!params.mediaList || params.mediaList.length === 0) {
    return { valid: false, message: '请至少添加一张图片或视频' };
  }
  return { valid: true, message: '' };
}

module.exports = {
  validateWishTitle,
  validateWishDescription,
  validateCheckInNote,
  validatePairCode,
  validateCategory,
  validateNickName,
  validateWishCreate,
  validateCheckInCreate,
};
