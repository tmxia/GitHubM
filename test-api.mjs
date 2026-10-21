import fs from 'fs';

const token = fs.readFileSync(process.env.HOME + '/.git-ps-token', 'utf8').trim();
console.log('Token 长度:', token.length);

const headers = {
  'Authorization': 'Bearer ' + token,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'GitHubM-App'
};

async function testApi(name, url) {
  console.log('\n▶ 测试接口: ' + name);
  const start = Date.now();
  try {
    const res = await fetch(url, { 
      headers,
      signal: AbortSignal.timeout(8000) // 强制 8 秒超时
    });
    const time = Date.now() - start;
    console.log('  状态码: ' + res.status + ' | 耗时: ' + time + 'ms');
    
    if (res.ok === false) {
      const text = await res.text();
      console.log('  ❌ 失败信息: ' + text.substring(0, 50));
      return null;
    }
    
    const data = await res.json();
    if (Array.isArray(data)) {
       console.log('  ✅ 成功拿到数组，长度: ' + data.length);
    } else if (data.items && Array.isArray(data.items)) {
       console.log('  ✅ 成功拿到对象，items 长度: ' + data.items.length);
    } else {
       console.log('  ✅ 成功拿到对象');
    }
    return data;
  } catch (err) {
    console.log('  ❌ 报错: ' + err.message + ' | 耗时: ' + (Date.now() - start) + 'ms');
    return null;
  }
}

async function main() {
  const user = await testApi('1. 获取用户 (/user)', 'https://api.github.com/user');
  await testApi('2. 最近仓库 (/user/repos)', 'https://api.github.com/user/repos?sort=updated&per_page=10');
  await testApi('3. 热门推荐 (/search/repositories)', 'https://api.github.com/search/repositories?q=stars:>10000&sort=stars&order=desc&per_page=10');
  
  if (user && user.login) {
    await testApi('4. 动态流 (/users/' + user.login + '/received_events)', 'https://api.github.com/users/' + user.login + '/received_events?per_page=30');
  } else {
    console.log('\n⚠️ 无法测试动态流，因为获取用户信息失败');
  }
}

main();
