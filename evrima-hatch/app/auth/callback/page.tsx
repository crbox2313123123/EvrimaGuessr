'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession();

      console.log("AUTH CALLBACK SESSION:", data.session);

      if (error || !data.session) {
        console.log("No session found");
        router.push('/login');
        return;
      }

      router.push('/hub');
    };

    handleCallback();
  }, []);

  return (
    <div style={{ color: '#0f0', padding: 40 }}>
      Logging you in...
    </div>
  );
}