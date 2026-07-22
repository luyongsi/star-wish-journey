// tests/mock-wx-server-sdk.js — wx-server-sdk 内存模拟
// 模拟 CloudBase 数据库操作，支持 collection/where/doc/add/update/remove/orderBy/skip/limit/count/runTransaction

let _collections = {};
let _currentOpenid = 'test_openid';
let _docIdCounter = 1;

function _generateId() {
  return 'id_' + String(_docIdCounter++);
}

function _resetData() {
  _collections = { users: [], couples: [], wishes: [], checkins: [] };
  _docIdCounter = 1;
  _currentOpenid = 'test_openid';
}

function _setOpenid(openid) {
  _currentOpenid = openid;
}

function _getCollections() {
  return _collections;
}

/**
 * 判断文档是否匹配查询条件
 */
function _matchesConditions(doc, conditions) {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [key, value] of Object.entries(conditions)) {
    if (value && typeof value === 'object' && value.__op === 'in') {
      if (!value.values.includes(doc[key])) return false;
    } else if (value && typeof value === 'object' && value.__op === 'neq') {
      if (doc[key] === value.value) return false;
    } else {
      if (doc[key] !== value) return false;
    }
  }
  return true;
}

/**
 * 查询构建器
 */
class Query {
  constructor(collectionName, conditions) {
    this._collectionName = collectionName;
    this._conditions = conditions || {};
    this._orderByField = null;
    this._orderByOrder = 'asc';
    this._skipCount = 0;
    this._limitCount = null;
  }

  where(conditions) {
    const merged = { ...this._conditions, ...conditions };
    return new Query(this._collectionName, merged);
  }

  orderBy(field, order) {
    this._orderByField = field;
    this._orderByOrder = order || 'asc';
    return this;
  }

  skip(n) {
    this._skipCount = n;
    return this;
  }

  limit(n) {
    this._limitCount = n;
    return this;
  }

  _getMatchingDocs() {
    let docs = (_collections[this._collectionName] || []).filter((doc) =>
      _matchesConditions(doc, this._conditions)
    );

    // 排序
    if (this._orderByField) {
      const field = this._orderByField;
      const order = this._orderByOrder;
      docs = docs.slice().sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        if (aVal instanceof Date && bVal instanceof Date) {
          return order === 'desc' ? bVal.getTime() - aVal.getTime() : aVal.getTime() - bVal.getTime();
        }
        if (aVal && aVal.getTime && bVal && bVal.getTime) {
          return order === 'desc' ? bVal.getTime() - aVal.getTime() : aVal.getTime() - aVal.getTime();
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return order === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        }
        aVal = aVal || 0;
        bVal = bVal || 0;
        return order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // 跳过
    if (this._skipCount > 0) {
      docs = docs.slice(this._skipCount);
    }

    // 限制
    if (this._limitCount !== null) {
      docs = docs.slice(0, this._limitCount);
    }

    // 返回深拷贝，防止外部直接修改
    return docs.map((d) => ({ ...d }));
  }

  async get() {
    return { data: this._getMatchingDocs() };
  }

  async count() {
    return { total: this._getMatchingDocs().length };
  }

  async remove() {
    const matching = this._getMatchingDocs();
    const matchingIds = new Set(matching.map((d) => d._id));
    _collections[this._collectionName] = (_collections[this._collectionName] || []).filter(
      (d) => !matchingIds.has(d._id)
    );
    return { stats: { removed: matching.length } };
  }

  async update({ data }) {
    const matching = this._getMatchingDocs();
    const matchingIds = new Set(matching.map((d) => d._id));
    _collections[this._collectionName] = (_collections[this._collectionName] || []).map((d) => {
      if (matchingIds.has(d._id)) {
        return { ...d, ...data };
      }
      return d;
    });
    return { stats: { updated: matching.length } };
  }
}

/**
 * 文档引用
 */
class DocRef {
  constructor(collectionName, id) {
    this._collectionName = collectionName;
    this._id = id;
  }

  async get() {
    const docs = _collections[this._collectionName] || [];
    const doc = docs.find((d) => d._id === this._id);
    return { data: doc ? { ...doc } : null };
  }

  async update({ data }) {
    const docs = _collections[this._collectionName] || [];
    const doc = docs.find((d) => d._id === this._id);
    if (doc) {
      Object.assign(doc, data);
    }
    return { stats: { updated: doc ? 1 : 0 } };
  }

  async remove() {
    const docs = _collections[this._collectionName] || [];
    const index = docs.findIndex((d) => d._id === this._id);
    if (index >= 0) {
      docs.splice(index, 1);
    }
    return { stats: { removed: index >= 0 ? 1 : 0 } };
  }
}

/**
 * 集合引用
 */
class Collection {
  constructor(name) {
    this._name = name;
    if (!_collections[name]) {
      _collections[name] = [];
    }
  }

  where(conditions) {
    return new Query(this._name, conditions);
  }

  doc(id) {
    return new DocRef(this._name, id);
  }

  async add({ data }) {
    const id = data._id || _generateId();
    const doc = { _id: id, ...data };
    _collections[this._name].push(doc);
    return { _id: id };
  }
}

/**
 * 数据库
 */
class Database {
  collection(name) {
    return new Collection(name);
  }

  get command() {
    return {
      in: (arr) => ({ __op: 'in', values: arr }),
      neq: (val) => ({ __op: 'neq', value: val }),
      eq: (val) => val,
    };
  }

  serverDate() {
    return new Date();
  }

  async runTransaction(fn) {
    // 简化版事务：直接执行，不提供真正的隔离
    const transaction = {
      collection(name) {
        return new Collection(name);
      },
    };
    return await fn(transaction);
  }
}

const mockCloud = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: 'test-env',
  getWXContext: () => ({ OPENID: _currentOpenid }),
  database: () => new Database(),
  _setOpenid,
  _resetData,
  _getCollections,
};

module.exports = mockCloud;
