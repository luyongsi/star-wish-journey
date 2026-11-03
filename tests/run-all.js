// tests/run-all.js — 主测试运行器
// 依次加载所有测试文件并运行
const { runAll, getTotalResults, resetHarness } = require('./test-harness');

async function main() {
  console.log('========================================');
  console.log('  心愿拾光 (WishPool) — 测试报告');
  console.log('  QA Engineer: Edward');
  console.log('========================================');

  const testFiles = [
    { name: 'Utils > Validator', path: './utils/validator.test.js' },
    { name: 'Utils > Format', path: './utils/format.test.js' },
    { name: 'Cloud Functions > Pair', path: './cloud-functions/pair.test.js' },
    { name: 'Cloud Functions > Wish', path: './cloud-functions/wish.test.js' },
    { name: 'Cloud Functions > CheckIn', path: './cloud-functions/checkin.test.js' },
    { name: 'Utils > Date', path: './utils/date.test.js' },
    { name: 'Utils > Map', path: './utils/map.test.js' },
    { name: 'Utils > Location', path: './utils/location.test.js' },
    { name: 'Utils > Badge', path: './utils/badge.test.js' },
    { name: 'Data > Inspiration', path: './data/inspiration.test.js' },
    { name: 'Cloud Functions > v1.1', path: './cloud-functions/v11.test.js' },
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures = [];

  for (const file of testFiles) {
    console.log(`\n--- ${file.name} ---`);
    resetHarness();
    // 加载测试文件（注册测试用例）
    require(file.path);
    // 运行测试
    const result = await runAll();
    totalPassed += result.passed;
    totalFailed += result.failed;
    allFailures.push(...result.failures);
  }

  console.log('========================================');
  console.log('  汇总结果');
  console.log('========================================');
  console.log(`  总测试数: ${totalPassed + totalFailed}`);
  console.log(`  通过: ${totalPassed}`);
  console.log(`  失败: ${totalFailed}`);
  console.log(`  通过率: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (allFailures.length > 0) {
    console.log('\n  失败用例详情:');
    allFailures.forEach((f, i) => {
      console.log(`    ${i + 1}. [${f.suite}] ${f.name}`);
      console.log(`       错误: ${f.error.message}`);
    });
  }

  console.log('\n========================================\n');

  // 退出码：有失败则返回1
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试运行器出错:', err);
  process.exit(2);
});
