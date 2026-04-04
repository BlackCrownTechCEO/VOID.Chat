-- ═══════════════════════════════════════════════════════
--  VOID Database Schema: Roles, Servers, Permissions
--  System Owner is a SECRET role - not exposed in UI
-- ═══════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════
--  1. PROFILES (extended for roles)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  void_id TEXT UNIQUE,
  nickname TEXT,
  avatar_url TEXT,
  provider TEXT,
  verified BOOLEAN DEFAULT false,
  
  -- Role system flags
  is_system_owner BOOLEAN DEFAULT false,  -- SECRET: Only set via GitHub OAuth for specific account
  is_system_admin BOOLEAN DEFAULT false,
  is_system_mod BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Public read for basic profile info (nickname, avatar)
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);


-- ══════════════════════════════════════════════════════
--  2. ROLES TABLE (define available roles)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Role hierarchy (higher = more power)
  priority INTEGER DEFAULT 0,
  
  -- Visibility
  is_secret BOOLEAN DEFAULT false,  -- Hidden from normal users
  color TEXT DEFAULT '#5b6cf5',
  icon TEXT,
  
  -- Scope
  scope TEXT DEFAULT 'system',  -- 'system' | 'server' | 'channel'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles
INSERT INTO public.roles (name, display_name, description, priority, is_secret, color, icon, scope) VALUES
  ('system_owner', 'System Owner', 'Full system control - invisible to users', 1000, true, '#FFD700', NULL, 'system'),
  ('system_admin', 'System Admin', 'System-wide administrative privileges', 900, false, '#EF4444', NULL, 'system'),
  ('system_mod', 'System Moderator', 'System-wide moderation privileges', 800, false, '#F59E0B', NULL, 'system'),
  ('server_owner', 'Server Owner', 'Owner of a server', 500, false, '#A78BFA', NULL, 'server'),
  ('server_admin', 'Server Admin', 'Server administrative privileges', 400, false, '#EC4899', NULL, 'server'),
  ('server_mod', 'Server Moderator', 'Server moderation privileges', 300, false, '#14B8A6', NULL, 'server'),
  ('channel_owner', 'Channel Owner', 'Owner of a channel', 200, false, '#22C55E', NULL, 'channel'),
  ('channel_admin', 'Channel Admin', 'Channel administrative privileges', 100, false, '#3B82F6', NULL, 'channel'),
  ('member', 'Member', 'Standard member', 0, false, '#6B7280', NULL, 'system')
ON CONFLICT (name) DO NOTHING;


-- ══════════════════════════════════════════════════════
--  3. USER_ROLES (many-to-many: user can have multiple roles)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  
  -- Scope context (optional, for server/channel-specific roles)
  server_id UUID,
  channel_id UUID,
  group_id UUID,
  
  -- Temp role support
  is_temp BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, role_id, server_id, channel_id, group_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS: Users can see their own roles, system owners can see all
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_system_owner = true)
);


-- ══════════════════════════════════════════════════════
--  4. SERVERS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Settings
  is_public BOOLEAN DEFAULT true,
  password_hash TEXT,
  max_members INTEGER DEFAULT 0,  -- 0 = unlimited
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "servers_public_read" ON public.servers FOR SELECT USING (is_public = true);
CREATE POLICY "servers_owner_all" ON public.servers FOR ALL USING (auth.uid() = owner_id);


-- ══════════════════════════════════════════════════════
--  5. SERVER_MEMBERS
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Server-specific role
  role TEXT DEFAULT 'member',  -- 'owner' | 'admin' | 'mod' | 'member'
  nickname TEXT,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(server_id, user_id)
);

ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "server_members_read" ON public.server_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_id AND sm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_system_owner = true)
);


-- ══════════════════════════════════════════════════════
--  6. GROUPS (within servers)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#5b6cf5',
  
  -- Standalone group (no server) or server group
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private BOOLEAN DEFAULT false,
  password_hash TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════
--  7. GROUP_MEMBERS
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  role TEXT DEFAULT 'member',  -- 'owner' | 'admin' | 'member'
  nickname TEXT,
  
  -- Temp membership (e.g., until logout from channel)
  is_temp BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════
--  8. CHANNELS (chat rooms within groups or standalone)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  topic TEXT,
  
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  is_locked BOOLEAN DEFAULT false,
  is_nsfw BOOLEAN DEFAULT false,
  slow_mode INTEGER DEFAULT 0,  -- seconds between messages
  password_hash TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════
--  9. SYSTEM_OWNER_GITHUB (whitelist for GitHub login → System Owner)
--     This stores the GitHub username that should become System Owner
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_owner_github (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_username TEXT UNIQUE NOT NULL,
  github_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert your GitHub username (replace with your actual GitHub username)
INSERT INTO public.system_owner_github (github_username) VALUES ('BlackCrownTechCEO')
ON CONFLICT (github_username) DO NOTHING;

ALTER TABLE public.system_owner_github ENABLE ROW LEVEL SECURITY;

-- Only system owners can read this table
CREATE POLICY "system_owner_github_read" ON public.system_owner_github FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_system_owner = true)
);


-- ══════════════════════════════════════════════════════
--  10. TRIGGER: Auto-assign System Owner on GitHub login
-- ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_github_system_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  github_username TEXT;
  is_whitelisted BOOLEAN;
BEGIN
  -- Only process GitHub provider
  IF NEW.raw_app_meta_data->>'provider' = 'github' THEN
    -- Get GitHub username from user metadata
    github_username := NEW.raw_user_meta_data->>'user_name';
    
    -- Check if this GitHub user is whitelisted as System Owner
    SELECT EXISTS(
      SELECT 1 FROM public.system_owner_github 
      WHERE github_username = github_username OR github_id = (NEW.raw_user_meta_data->>'provider_id')
    ) INTO is_whitelisted;
    
    -- Update profile with system owner status
    UPDATE public.profiles 
    SET is_system_owner = is_whitelisted,
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger after profile insert/update
DROP TRIGGER IF EXISTS on_github_login_check_owner ON auth.users;
CREATE TRIGGER on_github_login_check_owner
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_github_system_owner();


-- ══════════════════════════════════════════════════════
--  11. TRIGGER: Auto-create profile on signup
-- ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  github_username TEXT;
  is_system_owner_flag BOOLEAN := false;
BEGIN
  -- Check if GitHub user should be System Owner
  IF NEW.raw_app_meta_data->>'provider' = 'github' THEN
    github_username := NEW.raw_user_meta_data->>'user_name';
    
    SELECT EXISTS(
      SELECT 1 FROM public.system_owner_github 
      WHERE github_username = github_username
    ) INTO is_system_owner_flag;
  END IF;

  INSERT INTO public.profiles (
    id,
    void_id,
    nickname,
    avatar_url,
    provider,
    verified,
    is_system_owner,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'void_id', NULL),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'user_name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'unknown'),
    true,
    is_system_owner_flag,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nickname = EXCLUDED.nickname,
    avatar_url = EXCLUDED.avatar_url,
    provider = EXCLUDED.provider,
    is_system_owner = CASE 
      WHEN EXCLUDED.is_system_owner = true THEN true 
      ELSE public.profiles.is_system_owner 
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
