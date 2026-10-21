import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

const MOCK_PROFILE = {
  login: 'tmxia',
  name: '唐明',
  avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
  public_repos: 8,
  followers: 0,
  following: 4,
};

const MOCK_REPOS = [
  { id: 1, full_name: 'tmxia/MTF', description: 'MT 论坛安卓客户端', stargazers_count: 10, forks_count: 2, language: 'Kotlin' },
  { id: 2, full_name: 'tmxia/MTH', description: 'MT 论坛鸿蒙客户端', stargazers_count: 5, forks_count: 1, language: 'TypeScript' }
];

export default function HomeDynamic() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-red-500">阶段2：纯 UI 渲染测试</h1>

      <Card className="p-4 flex gap-4 items-center">
        <Avatar className="w-16 h-16">
          <AvatarImage src={MOCK_PROFILE.avatar_url} />
          <AvatarFallback>TM</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-bold">{MOCK_PROFILE.name}</h2>
          <p className="text-sm text-muted-foreground">@{MOCK_PROFILE.login}</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {MOCK_REPOS.map(r => (
          <Card key={r.id} className="p-4">
            <CardContent>
              <p className="font-bold text-primary">{r.full_name}</p>
              <p className="text-sm text-muted-foreground">{r.description}</p>
              <p className="text-xs text-gray-500 mt-2">⭐ {r.stargazers_count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <button
        onClick={() => setClicked(true)}
        className="px-4 py-2 bg-primary text-white rounded-md"
      >
        {clicked ? '点击成功！交互正常！' : '点击我测试交互'}
      </button>
    </div>
  );
}
