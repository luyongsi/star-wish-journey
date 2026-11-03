// data/inspiration.js — 愿望灵感库内置模板（40 条，PRD §5.3）
// 分布：美食 7 / 旅行 7 / 运动 6 / 电影 6 / 居家 7 / 其他 7

const TEMPLATES = [
  // 美食 7
  { key: 'food-1', category: 'food', title: '一起吃一顿海底捞', desc: '找个不赶时间的晚上，慢慢涮' },
  { key: 'food-2', category: 'food', title: '去吃一次早茶', desc: '起个大早，点上满满一桌' },
  { key: 'food-3', category: 'food', title: '一起做一顿双人晚餐', desc: '各自负责一道菜，互评口味' },
  { key: 'food-4', category: 'food', title: '去街边吃一次烧烤', desc: '坐在路边，吃到半夜' },
  { key: 'food-5', category: 'food', title: '一起吃一次火锅外卖', desc: '在家开着电视涮锅' },
  { key: 'food-6', category: 'food', title: '去打卡一家新开的店', desc: '随便挑一家没去过的' },
  { key: 'food-7', category: 'food', title: '一起逛一次菜市场', desc: '买点菜回家做顿家常饭' },

  // 旅行 7
  { key: 'travel-1', category: 'travel', title: '一起去看一次海', desc: '一起出发去海边，看日落' },
  { key: 'travel-2', category: 'travel', title: '去爬一座山看日出', desc: '凌晨出发，山顶等天亮' },
  { key: 'travel-3', category: 'travel', title: '去一次近郊一日游', desc: '不用请假，周末来回' },
  { key: 'travel-4', category: 'travel', title: '坐一次绿皮火车', desc: '慢一点，看看窗外的风景' },
  { key: 'travel-5', category: 'travel', title: '去一座没去过的城市', desc: '随便走走，不排行程' },
  { key: 'travel-6', category: 'travel', title: '一起去逛一次博物馆', desc: '挑个下雨天正好' },
  { key: 'travel-7', category: 'travel', title: '一起露营一次', desc: '带帐篷，看星星' },

  // 运动 6
  { key: 'sport-1', category: 'sport', title: '一起去打一次羽毛球', desc: '输的人请奶茶' },
  { key: 'sport-2', category: 'sport', title: '一起夜跑一次', desc: '绕操场跑三圈就够' },
  { key: 'sport-3', category: 'sport', title: '一起去游泳', desc: '夏天最舒服的约会' },
  { key: 'sport-4', category: 'sport', title: '一起骑一次共享单车', desc: '沿江边骑十公里' },
  { key: 'sport-5', category: 'sport', title: '一起爬一次楼梯登高', desc: '找个能俯瞰城市的楼' },
  { key: 'sport-6', category: 'sport', title: '一起打一次保龄球', desc: '谁输谁做家务' },

  // 电影 6
  { key: 'movie-1', category: 'movie', title: '看一场午夜场电影', desc: '散场天都亮了的那种' },
  { key: 'movie-2', category: 'movie', title: '在家看完一个三部曲', desc: '准备一大袋零食' },
  { key: 'movie-3', category: 'movie', title: '去看一次露天电影', desc: '草地上铺张垫子' },
  { key: 'movie-4', category: 'movie', title: '各自挑一部片交换看', desc: '写完观后感再交换' },
  { key: 'movie-5', category: 'movie', title: '去一次老电影院', desc: '找家开了很多年的那种' },
  { key: 'movie-6', category: 'movie', title: '一起看一次演唱会直播', desc: '在家开着灯当现场' },

  // 居家 7
  { key: 'home-1', category: 'home', title: '一起大扫除一次', desc: '把家收拾干净，点顿好的' },
  { key: 'home-2', category: 'home', title: '一起养一盆植物', desc: '给它在窗台找块位置' },
  { key: 'home-3', category: 'home', title: '一起拼一次拼图', desc: '1000 片那种，拼一晚上' },
  { key: 'home-4', category: 'home', title: '换一次床单被罩', desc: '顺便把房间布置一下' },
  { key: 'home-5', category: 'home', title: '一起做一次手工', desc: '给家里添个小摆件' },
  { key: 'home-6', category: 'home', title: '一起整理一次照片', desc: '挑一批打印出来' },
  { key: 'home-7', category: 'home', title: '在家办一次电影之夜', desc: '关灯、投影、爆米花' },

  // 其他 7
  { key: 'other-1', category: 'other', title: '给彼此写一封信', desc: '手写，收起来一年后再看' },
  { key: 'other-2', category: 'other', title: '一起拍一组照片', desc: '找家照相馆拍套写真' },
  { key: 'other-3', category: 'other', title: '一起做一件小公益', desc: '义工、捐书都算' },
  { key: 'other-4', category: 'other', title: '交换一次礼物', desc: '预算 100 块以内' },
  { key: 'other-5', category: 'other', title: '整理一份共同歌单', desc: '每首歌都对应一段回忆' },
  { key: 'other-6', category: 'other', title: '一起做一次年度计划', desc: '写下今年想完成的十件事' },
  { key: 'other-7', category: 'other', title: '去一次对方的家乡', desc: '看看 TA 长大的地方' },
];

module.exports = {
  TEMPLATES,
};
