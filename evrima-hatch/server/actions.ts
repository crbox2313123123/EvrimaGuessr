  'use server';

  import { createServerClient } from '@supabase/ssr';
  import { cookies } from 'next/headers';
  import { revalidatePath } from 'next/cache';

  // Reliable Supabase client for Server Actions
  async function getSupabase() {
    const cookieStore = await cookies();
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // safe to ignore in Server Actions
            }
          },
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATE NEW EGG
  export async function generateNewEgg() {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const userId = session.user.id;

    const { data, error } = await supabase.rpc('generate_new_egg', {
      p_user_id: userId,
    });
    if (error) throw new Error(`Generate egg failed: ${error.message}`);

    revalidatePath('/hub');
    return data;
  }

export async function leaveMap() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const userId = session.user.id;

  const { error } = await supabase.rpc('leave_map', { p_user_id: userId });
  if (error) throw new Error(`Leave map failed: ${error.message}`);

  revalidatePath('/map');
}


  // ─────────────────────────────────────────────────────────────
  // CLEAR ALL DINOS
  export async function clearAllDinos() {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const userId = session.user.id;

    const { error } = await supabase.rpc('clear_all_player_dinos', {
      p_user_id: userId,
    });
    if (error) throw new Error(`Clear failed: ${error.message}`);

    revalidatePath('/hub');
  }

  // ─────────────────────────────────────────────────────────────
  // SERVER TICK
  export async function serverTick() {
    const supabase = await getSupabase();
    console.log('🔄 serverTick — running global dinosaur simulation');
    const { error } = await supabase.rpc('server_tick_dino');
    if (error) throw new Error(`Server tick failed: ${error.message}`);
    revalidatePath('/hub');
  }

  // ─────────────────────────────────────────────────────────────
  // RECALCULATE STATS
  export async function recalculateDinoStats(dinoId: string) {
    const supabase = await getSupabase();
    console.log('📊 recalculateDinoStats for dino:', dinoId);
    const { error } = await supabase.rpc('recalculate_dino_stats', {
      p_dino_id: dinoId,
    });
    if (error) throw new Error(`Recalculate stats failed: ${error.message}`);
    revalidatePath('/hub');
  }

  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // ENTER MAP - ATOMIC RPC VERSION (foolproof)
  export async function enterMap(mapKey: string = 'forest') {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const userId = session.user.id;

    const { data, error } = await supabase.rpc('enter_map', {
      p_user_id: userId,
      p_map_key: mapKey
    });

    if (error) {
      throw new Error(`Failed to join map: ${error.message}`);
    }

    revalidatePath('/map');
    return data;
  }