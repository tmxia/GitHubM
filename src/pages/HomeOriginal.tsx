import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HomeDynamic from './HomeDynamic';

export default function HomeOriginal() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'dynamic' ? 'dynamic' : 'original';
  const [tab, setTab] = useState<'original' | 'dynamic'>(initialTab);

  useEffect(() => {
    const currentTab = searchParams.get('tab') === 'dynamic' ? 'dynamic' : 'original';
    setTab(currentTab);
  }, [searchParams]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex-1 w-full">
        {tab === 'original' ? <HomeOriginal /> : <HomeDynamic />}
      </div>
    </div>
  );
}
