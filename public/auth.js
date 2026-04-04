// ═══════════════════════════════════════════════════════
//  auth.js — VOID Supabase Auth
//  Providers: Google · Apple · GitHub · GitLab
// ═══════════════════════════════════════════════════════
;(async () => {

const SUPABASE_URL = 'https://tjctchqybxamoyympkcp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_1F5cUa5Okr03_R2WwTMXYg_OiC1ZWX-'
const REDIRECT     = window.location.origin

// ── Client ───────────────────────────────────────────
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ──────────────────────────────────────────
async function getSession() {
    const { data: { session } } = await _sb.auth.getSession()
    return session
}

async function getUser() {
    const s = await getSession()
    return s?.user || null
}

// ── OAuth sign-in ─────────────────────────────────────
async function signInWith(provider) {
    const { error } = await _sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: REDIRECT }
    })
    if (error) console.error('[VOID Auth]', error.message)
}

// ── Profile: save or update ───────────────────────────
async function saveProfile({ voidId, nickname }) {
    const user = await getUser()
    if (!user) return

    const meta     = user.user_metadata || {}
    const avatar   = meta.avatar_url || meta.picture || null
    const provider = user.app_metadata?.provider || 'unknown'

    const { error } = await _sb.from('profiles').upsert({
        id:          user.id,
        void_id:     voidId,
        nickname:    nickname || meta.name || meta.full_name || voidId,
        avatar_url:  avatar,
        provider,
        verified:    true,
        updated_at:  new Date().toISOString()
    }, { onConflict: 'id' })

    if (error) console.error('[VOID Auth] profile save:', error.message)
    return !error
}

// ── Restore VOID ID from linked account ───────────────
async function restoreIdentity() {
    const user = await getUser()
    if (!user) return null

    const { data, error } = await _sb.from('profiles')
        .select('void_id, nickname, avatar_url')
        .eq('id', user.id)
        .single()

    if (error || !data) return null
    return data
}

// ── Is void_id verified (has linked account)? ─────────
async function isVerified(voidId) {
    const { data } = await _sb.from('profiles')
        .select('verified')
        .eq('void_id', voidId)
        .single()
    return !!data?.verified
}

// ── Sign out ──────────────────────────────────────────
async function signOut() {
    await _sb.auth.signOut()
    updateAuthUI(null)
}

// ── UI helpers ────────────────────────────────────────
function updateAuthUI(user) {
    const linked   = document.getElementById('authLinkedSection')
    const unlinked = document.getElementById('authUnlinkedSection')
    const restore  = document.getElementById('authRestoreSection')
    const userEl   = document.getElementById('authUserEmail')
    const avatarEl = document.getElementById('authProviderAvatar')

    if (!linked) return

    if (user) {
        const meta = user.user_metadata || {}
        if (userEl)   userEl.textContent  = user.email || meta.email || meta.name || 'Linked'
        if (avatarEl) avatarEl.src        = meta.avatar_url || meta.picture || ''
        linked.style.display   = 'block'
        if (unlinked) unlinked.style.display = 'none'
        if (restore)  restore.style.display  = 'none'
    } else {
        linked.style.display   = 'none'
        if (unlinked) unlinked.style.display = 'block'
    }
}

// ── Auth state listener ───────────────────────────────
_sb.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null
    updateAuthUI(user)

    if (event === 'SIGNED_IN' && user) {
        // New device restore path
        const storedId = localStorage.getItem('void_identity')
        if (!storedId) {
            // Try to restore from Supabase
            const profile = await restoreIdentity()
            if (profile && window.VoidAuth?._onRestore) {
                window.VoidAuth._onRestore(profile)
            }
        } else {
            // Existing device — save/update profile
            try {
                const identity = JSON.parse(storedId)
                if (identity?.voidId) {
                    await saveProfile({ voidId: identity.voidId, nickname: identity.nickname })
                }
            } catch (_) {}
        }
    }
})

// ── Wire OAuth buttons ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-oauth]').forEach(btn => {
        btn.addEventListener('click', () => signInWith(btn.dataset.oauth))
    })

    const signOutBtn = document.getElementById('authSignOutBtn')
    if (signOutBtn) signOutBtn.addEventListener('click', signOut)

    const restoreBtn = document.getElementById('authRestoreBtn')
    if (restoreBtn) {
        restoreBtn.addEventListener('click', async () => {
            const profile = await restoreIdentity()
            if (profile && window.VoidAuth?._onRestore) {
                window.VoidAuth._onRestore(profile)
            }
        })
    }
})

// ── Check session on load → show restore banner ───────
getSession().then(async session => {
    updateAuthUI(session?.user || null)

    if (session?.user) {
        const storedId = localStorage.getItem('void_identity')
        if (!storedId) {
            // No local identity → offer restore
            const restore = document.getElementById('authRestoreSection')
            if (restore) restore.style.display = 'block'
            const unlinked = document.getElementById('authUnlinkedSection')
            if (unlinked) unlinked.style.display = 'none'
        }
    }
})

// ── Public API ────────────────────────────────────────
window.VoidAuth = {
    signInWith,
    signOut,
    saveProfile,
    restoreIdentity,
    isVerified,
    getSession,
    getUser,
    _onRestore: null,  // set by app.js
    _sb
}

})()
