const token = process.argv[2];
const owner = process.argv[3] || 'tmxia';
const repo = process.argv[4] || 'GitHubM';
if (!token) { console.error("❌ 请提供 Token"); process.exit(1); }
const BASE = `https://api.github.com/repos/${owner}/${repo}`;
const groups = {
  "基础信息": { description: "Test", has_issues: true, has_wiki: true, has_projects: true },
  "新增开关": { has_downloads: true, allow_auto_merge: false, delete_branch_on_merge: false, is_template: false, web_commit_signoff_required: false },
  "归档测试": { archived: false },
  "REST不支持的字段": { has_discussions: false },
  "安全选项": { security_and_analysis: { secret_scanning: { status: "disabled" }, dependabot_alerts: { status: "disabled" } } }
};
(async () => {
  console.log(`\n开始验证仓库: ${owner}/${repo}\n`);
  for (const [name, payload] of Object.entries(groups)) {
    process.stdout.write(`测试 [${name}] ... `);
    try {
      const res = await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        console.log("✅ 成功");
      } else {
        console.log(`❌ 失败 (HTTP ${res.status})`);
        console.log(`   错误: ${data.message}`);
        if (data.errors) console.log(`   详情: ${JSON.stringify(data.errors)}`);
      }
    } catch (e) { console.log(`❌ 异常: ${e.message}`); }
    await new Promise(r => setTimeout(r, 1000));
  }
})();
