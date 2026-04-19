'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
  const getSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  };

  getSession();

  const { data: listener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setSession(session);
    }
  );

  return () => listener.subscription.unsubscribe();
}, []);

const loginWithProvider = async (provider: 'google' | 'discord') => {
  setLoading(true);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    alert('Login error: ' + error.message);
    setLoading(false);
  }
};
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a1f]">
      <div className="text-center">
        <img 
          src="/mobilebanner.png" 
          alt="EVRIHATCH" 
          className="mx-auto mb-8 max-h-[80px] image-rendering-pixelated" 
        />
        <h1 className="text-4xl text-[#0f0] mb-12 tracking-widest">EVRIHATCH</h1>
        
{session ? (
  <div style={{ color: '#0f0', marginBottom: 20 }}>
    <div>✅ LOGGED IN</div>
    <div>ID: {session.user.id}</div>
    <div>Email: {session.user.email}</div>
    <div>
      Name: {session.user.user_metadata?.full_name || session.user.user_metadata?.name}
    </div>
  </div>
) : (
  <div style={{ color: '#f00', marginBottom: 20 }}>
    ❌ NOT LOGGED IN
  </div>
)}


        <div className="space-y-6">
          <button
            onClick={() => loginWithProvider('google')}
            disabled={loading}
            className="w-96 py-6 border-4 border-[#4285F4] bg-[#4285F4] text-white text-xl hover:scale-105 transition disabled:opacity-50"
          >
            🔵 LOGIN WITH GOOGLE
          </button>
          <button
            onClick={() => loginWithProvider('discord')}
            disabled={loading}
            className="w-96 py-6 border-4 border-[#5865F2] bg-[#5865F2] text-white text-xl hover:scale-105 transition disabled:opacity-50"
          >
            🐙 LOGIN WITH DISCORD
          </button>
        </div>
      </div>
    </div>
  );
}