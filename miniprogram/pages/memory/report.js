// pages/memory/report.js — 年度报告页
const memoryService = require('../../services/memory');
const mediaService = require('../../services/media');
const pairService = require('../../services/pair');
const store = require('../../utils/store');
const { categoryIcons, category: categoryNames } = require('../../utils/constants');
const { formatDate } = require('../../utils/format');

// 长图逻辑尺寸（绘制坐标系），实际像素 = 逻辑尺寸 × pixelRatio
const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 1400;

Page({
  data: {
    year: new Date().getFullYear(),
    loading: true,
    report: null,
    // 头部昵称
    myName: '我',
    partnerName: 'TA',
    anniversaryDays: 0,
    // I2 核心数字
    wishCreated: 0,
    wishCompleted: 0,
    checkInTotal: 0,
    // I3 月度分布
    monthlyBars: [],
    topMonthText: '',
    // I4 最爱的分类
    topCategoryIcon: '',
    topCategoryName: '',
    topCategoryCount: 0,
    // I5 最佳瞬间
    bestMoment: null,
    bestMomentDate: '',
    bestMomentThumb: '',
    // 保存长图状态
    saving: false,
  },

  onLoad(options) {
    const year = Number(options && options.year) || new Date().getFullYear();
    this.setData({ year });
    this.fetchReport(year);
  },

  /**
   * 获取年度报告
   */
  fetchReport(year) {
    memoryService.getAnnualReport(year)
      .then((res) => {
        this.setData({
          report: res,
          loading: false,
          wishCreated: res.wishCreated || 0,
          wishCompleted: res.wishCompleted || 0,
          checkInTotal: res.checkInTotal || 0,
          anniversaryDays: res.anniversaryDays || 0,
        });

        this._buildMonthlyBars(res.monthly || [], res.topMonth);
        this._buildTopCategory(res.topCategory);
        this._buildBestMoment(res.bestMoment);
      })
      .catch((err) => {
        console.error('[memory/report] 获取年度报告失败:', err);
        this.setData({ loading: false });
      });

    this._loadCoupleNames();
  },

  /**
   * 昵称：优先 pairService.getCoupleInfo()，失败时退回 store 缓存
   */
  _loadCoupleNames() {
    pairService.getCoupleInfo()
      .then((res) => {
        const me = (res && res.currentUser) || store.getUser() || {};
        const partner = (res && res.partner) || {};
        this.setData({
          myName: me.nickName || '我',
          partnerName: partner.nickName || 'TA',
        });
      })
      .catch((err) => {
        console.error('[memory/report] 获取昵称失败:', err);
        const me = store.getUser() || {};
        this.setData({ myName: me.nickName || '我', partnerName: 'TA' });
      });
  },

  /**
   * I3 月度分布：12 根柱，高度按当月最大值归一化为百分比
   * @param {Array<number>} monthly
   * @param {Object|null} topMonth - { month, count }
   */
  _buildMonthlyBars(monthly, topMonth) {
    const arr = new Array(12).fill(0);
    monthly.forEach((v, i) => {
      if (i < 12) arr[i] = Number(v) || 0;
    });
    const max = Math.max.apply(null, arr.concat([0]));

    const monthlyBars = arr.map((count, i) => ({
      month: i + 1,
      count,
      pct: max > 0 ? Math.round((count / max) * 100) : 0,
      isTop: max > 0 && count === max,
    }));

    const topMonthText = topMonth ? `${topMonth.month} 月最活跃（${topMonth.count} 次）` : '';

    this.setData({ monthlyBars, topMonthText });
  },

  /**
   * I4 最爱的分类
   */
  _buildTopCategory(topCategory) {
    if (!topCategory || !topCategory.category) return;
    this.setData({
      topCategoryIcon: categoryIcons[topCategory.category] || '💝',
      topCategoryName: categoryNames[topCategory.category] || '其他',
      topCategoryCount: topCategory.count || 0,
    });
  },

  /**
   * I5 年度最佳瞬间
   */
  _buildBestMoment(bestMoment) {
    if (!bestMoment || !bestMoment.checkInId) return;

    this.setData({
      bestMoment,
      bestMomentDate: bestMoment.createdAt ? formatDate(bestMoment.createdAt) : '',
    });

    const fileId = bestMoment.media && bestMoment.media.fileId;
    if (!fileId) return;

    mediaService.getTempFileURL([fileId])
      .then((fileList) => {
        const found = (fileList || []).find((f) => f.fileID === fileId);
        if (found && found.tempFileURL) {
          this.setData({ bestMomentThumb: found.tempFileURL });
        }
      })
      .catch((err) => console.error('[memory/report] 加载最佳瞬间缩略图失败:', err));
  },

  /**
   * 点最佳瞬间 → 打卡详情
   */
  handleOpenMoment() {
    const moment = this.data.bestMoment;
    if (!moment || !moment.checkInId) return;
    wx.navigateTo({
      url: `/pages/checkin/detail?id=${moment.checkInId}`,
    });
  },

  /**
   * I6 保存为长图：canvas 2d 绘制 → 导出 → 保存相册
   */
  handleSaveImage() {
    if (this.data.saving || this.data.loading) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '生成中...', mask: true });

    try {
      const query = wx.createSelectorQuery().in(this);
      query
        .select('#reportCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            this._saveFailed(new Error('未找到 canvas 节点'));
            return;
          }
          this._drawAndSave(res[0].node);
        });
    } catch (err) {
      this._saveFailed(err);
    }
  },

  /**
   * 绘制并保存
   * @param {Object} canvas - canvas 2d 节点
   */
  _drawAndSave(canvas) {
    let dpr = 2;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      // 限制最大 2 倍，避免 3 倍屏下 2250×4200 画布占用过多内存
      dpr = Math.min(info.pixelRatio || 2, 2);
    } catch (e) {
      console.warn('[memory/report] 获取 pixelRatio 失败，使用 2:', e);
    }
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    try {
      this._drawReport(ctx);
    } catch (err) {
      this._saveFailed(err);
      return;
    }

    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: (res) => this._saveToAlbum(res.tempFilePath),
      fail: (err) => this._saveFailed(err),
    });
  },

  /**
   * 绘制长图内容
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawReport(ctx) {
    const d = this.data;
    const PINK = '#FF6B9D';
    const TEXT = '#2D3436';
    const SUB = '#636E72';
    const LIGHT = '#B2BEC3';

    // 背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 头部色块
    ctx.fillStyle = PINK;
    ctx.fillRect(0, 0, CANVAS_WIDTH, 230);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '26px sans-serif';
    ctx.fillText(`${d.year} 年度报告`, CANVAS_WIDTH / 2, 70);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('我们的一年', CANVAS_WIDTH / 2, 135);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '24px sans-serif';
    ctx.fillText(
      `${d.myName} ❤️ ${d.partnerName} · 在一起 ${d.anniversaryDays} 天`,
      CANVAS_WIDTH / 2,
      190
    );

    // I2 核心数字
    const stats = [
      { value: d.wishCreated, label: '新增愿望' },
      { value: d.wishCompleted, label: '一起完成' },
      { value: d.checkInTotal, label: '打卡记录' },
    ];
    stats.forEach((item, i) => {
      const cx = CANVAS_WIDTH / 6 + (CANVAS_WIDTH / 3) * i;
      ctx.fillStyle = PINK;
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(String(item.value), cx, 330);
      ctx.fillStyle = SUB;
      ctx.font = '24px sans-serif';
      ctx.fillText(item.label, cx, 375);
    });

    // 分隔线
    ctx.strokeStyle = '#FFF0F5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 415);
    ctx.lineTo(CANVAS_WIDTH - 60, 415);
    ctx.stroke();

    // I3 月度分布
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('月度分布', 60, 465);

    const chartTop = 500;
    const chartBottom = 760;
    const chartLeft = 70;
    const chartRight = CANVAS_WIDTH - 70;
    const slot = (chartRight - chartLeft) / 12;
    const barWidth = slot * 0.5;
    const bars = d.monthlyBars || [];

    // 基线
    ctx.strokeStyle = '#FFF0F5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom + 1);
    ctx.lineTo(chartRight, chartBottom + 1);
    ctx.stroke();

    ctx.textAlign = 'center';
    bars.forEach((bar, i) => {
      const x = chartLeft + slot * i + (slot - barWidth) / 2;
      const h = ((chartBottom - chartTop) * bar.pct) / 100;
      const y = chartBottom - h;

      ctx.fillStyle = bar.isTop ? PINK : '#FFC7DC';
      if (h > 0) {
        ctx.fillRect(x, y, barWidth, h);
      }

      ctx.fillStyle = LIGHT;
      ctx.font = '18px sans-serif';
      ctx.fillText(`${bar.month}月`, x + barWidth / 2, chartBottom + 24);
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = SUB;
    ctx.font = '22px sans-serif';
    ctx.fillText(d.topMonthText || '每月打卡次数', 60, 815);

    // I4 最爱的分类
    if (d.topCategoryName) {
      ctx.fillStyle = TEXT;
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('最爱的分类', 60, 885);
      ctx.fillStyle = PINK;
      ctx.font = '27px sans-serif';
      ctx.fillText(
        `${d.topCategoryIcon} ${d.topCategoryName}（${d.topCategoryCount} 个）`,
        60,
        935
      );
    }

    // I5 年度最佳瞬间
    if (d.bestMoment) {
      ctx.fillStyle = TEXT;
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('年度最佳瞬间', 60, 1010);

      ctx.fillStyle = SUB;
      ctx.font = '27px sans-serif';
      const title = d.bestMoment.wishTitle || '愿望打卡';
      this._drawEllipsisText(ctx, title, 60, 1065, CANVAS_WIDTH - 120);

      ctx.fillStyle = LIGHT;
      ctx.font = '22px sans-serif';
      ctx.fillText(d.bestMomentDate || '', 60, 1110);
    }

    // 页脚
    ctx.textAlign = 'center';
    ctx.fillStyle = LIGHT;
    ctx.font = '22px sans-serif';
    ctx.fillText('心愿拾光 · 记录我们的每一次心动', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 70);
  },

  /**
   * 单行省略绘制
   */
  _drawEllipsisText(ctx, text, x, y, maxWidth) {
    let out = text;
    if (ctx.measureText(out).width > maxWidth) {
      while (out.length > 1 && ctx.measureText(out + '...').width > maxWidth) {
        out = out.slice(0, -1);
      }
      out += '...';
    }
    ctx.fillText(out, x, y);
  },

  /**
   * 保存到相册（区分权限拒绝）
   */
  _saveToAlbum(tempFilePath) {
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success: () => {
        wx.hideLoading();
        this.setData({ saving: false });
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        console.error('[memory/report] 保存到相册失败:', err);
        wx.hideLoading();
        this.setData({ saving: false });
        const msg = (err && err.errMsg) || '';
        if (msg.indexOf('auth') > -1 || msg.indexOf('deny') > -1) {
          this._showAuthGuide();
          return;
        }
        // 从设置里核对权限状态，以便区分「权限被关」与其它失败
        wx.getSetting({
          success: (setting) => {
            if (setting.authSetting['scope.writePhotosAlbum'] === false) {
              this._showAuthGuide();
            } else {
              wx.showToast({ title: '保存失败，请检查相册权限后重试', icon: 'none' });
            }
          },
          fail: () => {
            wx.showToast({ title: '保存失败，请检查相册权限后重试', icon: 'none' });
          },
        });
      },
    });
  },

  /**
   * 相册权限引导
   */
  _showAuthGuide() {
    wx.showModal({
      title: '需要相册权限',
      content: '保存长图需要访问相册，请在设置中开启「添加到相册」权限后重试。',
      confirmText: '去设置',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.openSetting({
            success: (settingRes) => {
              if (settingRes.authSetting['scope.writePhotosAlbum']) {
                wx.showToast({ title: '权限已开启，请重新保存', icon: 'none' });
              }
            },
            fail: (err) => console.error('[memory/report] 打开设置失败:', err),
          });
        }
      },
    });
  },

  /**
   * 统一失败处理
   */
  _saveFailed(err) {
    console.error('[memory/report] 生成长图失败:', err);
    wx.hideLoading();
    this.setData({ saving: false });
    wx.showToast({ title: '保存失败，请检查相册权限后重试', icon: 'none' });
  },
});
