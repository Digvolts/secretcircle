'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Heart, MessageCircle, Share2, Repeat2, Camera, CalendarDays, UserCheck, UserPlus } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { id } from 'date-fns/locale'

interface ProfileUser {
  id: string
  username: string
  display_name: string | null
  avatar: string | null
  bio: string | null
  created_at: string
}

interface Post {
  id: string
  user_id: string
  text: string
  image: string | null
  likes: number
  replies_count: number
  created_at: string
  user: { username: string; avatar: string | null }
}

interface ProfileModalProps {
  username: string
  currentUser: any
  likedPosts: Set<string>
  repostedPostIds: Set<string>
  repostCounts: Record<string, number>
  onClose: () => void
  onPostClick: (post: Post) => void
  onLike: (postId: string, currentLikes: number) => void
  onRepost: (postId: string, ownerId: string) => void
  onShowAuth: () => void
}

export default function ProfileModal({
  username,
  currentUser,
  likedPosts,
  repostedPostIds,
  repostCounts,
  onClose,
  onPostClick,
  onLike,
  onRepost,
  onShowAuth,
}: ProfileModalProps) {
  const [profile, setProfile] = useState<ProfileUser | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'posts' | 'likes' | 'following'>('posts')
  const [likedPostsList, setLikedPostsList] = useState<Post[]>([])
  const [followingList, setFollowingList] = useState<ProfileUser[]>([])

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)

  const isOwnProfile = currentUser?.username === username

  useEffect(() => {
    fetchProfile()
  }, [username])

  useEffect(() => {
    if (activeTab === 'likes' && likedPostsList.length === 0 && profile) {
      fetchLikedPosts()
    }
    if (activeTab === 'following' && followingList.length === 0 && profile) {
      fetchFollowingList()
    }
  }, [activeTab, profile])

  async function fetchProfile() {
    setLoading(true)
    try {
      // Fetch user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, username, display_name, avatar, bio, created_at')
        .eq('username', username)
        .single()
      if (userError) throw userError
      setProfile(userData)
      setEditDisplayName(userData.display_name || userData.username)
      setEditBio(userData.bio || '')

      // Fetch user's posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*, user:user_id(username, avatar)')
        .eq('user_id', userData.id)
        .order('created_at', { ascending: false })
      if (postsError) throw postsError
      setPosts(postsData || [])

      // Fetch follow counts
      await fetchFollowData(userData.id)
    } catch (err) {
      console.error('Error fetching profile:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchFollowData(profileUserId: string) {
    try {
      // Followers count — how many people follow this profile
      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileUserId)
      setFollowersCount(fCount || 0)

      // Following count — how many people this profile follows
      const { count: ingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileUserId)
      setFollowingCount(ingCount || 0)

      // Is current user following this profile?
      if (currentUser && currentUser.id !== profileUserId) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUser.id)
          .eq('following_id', profileUserId)
          .maybeSingle()
        setIsFollowing(!!followData)
      }
    } catch (err) {
      console.warn('Follow data fetch failed:', err)
    }
  }

  async function fetchFollowingList() {
    if (!profile) return
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id, users!follows_following_id_fkey(id, username, display_name, avatar, bio, created_at)')
        .eq('follower_id', profile.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const list = (data || [])
        .map((f: any) => Array.isArray(f.users) ? f.users[0] : f.users)
        .filter(Boolean)
      setFollowingList(list)
    } catch (err) {
      console.warn('Error fetching following list:', err)
      // Fallback: fetch without join
      try {
        const { data: rawData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', profile.id)
        const ids = (rawData || []).map((f: any) => f.following_id)
        if (ids.length === 0) { setFollowingList([]); return }
        const { data: usersData } = await supabase
          .from('users')
          .select('id, username, display_name, avatar, bio, created_at')
          .in('id', ids)
        setFollowingList(usersData || [])
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr)
      }
    }
  }

  async function toggleFollow() {
    if (!currentUser || !profile) { onShowAuth(); return }
    if (currentUser.id === profile.id) return

    setFollowLoading(true)
    const wasFollowing = isFollowing

    // Optimistic update
    setIsFollowing(!wasFollowing)
    setFollowersCount(prev => wasFollowing ? Math.max(0, prev - 1) : prev + 1)

    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', profile.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: currentUser.id, following_id: profile.id })
        if (error && error.code !== '23505') throw new Error(error.message)
      }
    } catch (err: any) {
      // Revert optimistic update
      setIsFollowing(wasFollowing)
      setFollowersCount(prev => wasFollowing ? prev + 1 : Math.max(0, prev - 1))
      console.error('Error toggling follow:', err.message)
    } finally {
      setFollowLoading(false)
    }
  }

  async function fetchLikedPosts() {
    if (!profile) return
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('post_id, posts(*, user:user_id(username, avatar))')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const liked = (data || [])
        .map((l: any) => l.posts)
        .filter(Boolean)
      setLikedPostsList(liked)
    } catch (err) {
      console.error('Error fetching liked posts:', err)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) { alert('Avatar must be under 2MB'); return }
    setEditAvatarFile(file)
    setEditAvatarPreview(URL.createObjectURL(file))
  }

  async function saveProfile() {
    if (!currentUser || !profile) return
    setSaving(true)
    try {
      let avatarUrl = profile.avatar

      // Upload new avatar if selected
      if (editAvatarFile) {
        const ext = editAvatarFile.name.split('.').pop()?.toLowerCase()
        const path = `avatars/${currentUser.id}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('post-images')
          .upload(path, editAvatarFile, { upsert: true, contentType: editAvatarFile.type })
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }

      const { error } = await supabase
        .from('users')
        .update({
          display_name: editDisplayName.trim() || profile.username,
          bio: editBio.trim(),
          avatar: avatarUrl,
        })
        .eq('id', currentUser.id)
      if (error) throw error

      // Refresh profile
      await fetchProfile()
      setIsEditing(false)
      setEditAvatarFile(null)
      setEditAvatarPreview(null)
    } catch (err: any) {
      console.error('Error saving profile:', err)
      alert(`Failed to save: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function formatJoinDate(dateStr: string) {
    try {
      const fixed = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
      return format(new Date(fixed), 'MMMM yyyy')
    } catch { return '' }
  }

  function formatTime(dateStr: string) {
    try {
      const fixed = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
      const date = new Date(fixed)
      if (isNaN(date.getTime())) return 'now'
      return formatDistanceToNow(date, { addSuffix: true, locale: id })
    } catch { return 'now' }
  }

  const displayName = profile?.display_name || profile?.username || username
  const activePosts = activeTab === 'posts' ? posts : likedPostsList

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-black border border-gray-800 w-full max-w-[598px] min-h-screen">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-black/85 backdrop-blur-md border-b border-gray-800 flex items-center gap-4 px-4 py-3">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-900 transition">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-xl font-bold leading-tight">{loading ? '...' : displayName}</p>
            <p className="text-gray-500 text-[13px]">{posts.length} posts</p>
          </div>
        </div>

        {loading ? (
          // Skeleton
          <div className="animate-pulse">
            <div className="h-32 bg-gray-900" />
            <div className="px-4 pb-4">
              <div className="w-20 h-20 rounded-full bg-gray-800 -mt-10 mb-3 border-4 border-black" />
              <div className="h-5 bg-gray-800 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-800 rounded w-1/4 mb-4" />
              <div className="h-4 bg-gray-800 rounded w-2/3" />
            </div>
          </div>
        ) : profile ? (
          <>
            {/* Banner */}
            <div className="h-32 bg-gradient-to-br from-purple-900 via-pink-900 to-indigo-900 relative" />

            {/* Avatar + Edit Button */}
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between -mt-10 mb-3">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-black overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500">
                    {(editAvatarPreview || profile.avatar) ? (
                      <img
                        src={editAvatarPreview || profile.avatar!}
                        alt={profile.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="flex items-center justify-center w-full h-full text-2xl">🔥</span>
                    )}
                  </div>
                  {isEditing && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer">
                      <Camera size={20} className="text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </label>
                  )}
                </div>

                {isOwnProfile && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="border border-gray-600 hover:border-gray-400 text-white font-bold text-[15px] px-5 py-1.5 rounded-full transition"
                  >
                    Edit profile
                  </button>
                )}
                {isOwnProfile && isEditing && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setIsEditing(false); setEditAvatarPreview(null); setEditAvatarFile(null) }}
                      disabled={saving}
                      className="border border-gray-600 hover:border-gray-400 text-white font-bold text-[15px] px-4 py-1.5 rounded-full transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="bg-white hover:bg-gray-200 text-black font-bold text-[15px] px-4 py-1.5 rounded-full transition disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}

                {/* Follow / Unfollow button — only for other users' profiles */}
                {!isOwnProfile && currentUser && (
                  <button
                    onClick={toggleFollow}
                    disabled={followLoading}
                    className={`flex items-center gap-2 font-bold text-[15px] px-5 py-1.5 rounded-full transition disabled:opacity-50
                      ${isFollowing
                        ? 'border border-gray-600 hover:border-red-500 hover:text-red-500 text-white'
                        : 'bg-white hover:bg-gray-200 text-black'
                      }`}
                  >
                    {isFollowing
                      ? <><UserCheck size={16} /> Following</>
                      : <><UserPlus size={16} /> Follow</>
                    }
                  </button>
                )}
                {!isOwnProfile && !currentUser && (
                  <button
                    onClick={onShowAuth}
                    className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black font-bold text-[15px] px-5 py-1.5 rounded-full transition"
                  >
                    <UserPlus size={16} /> Follow
                  </button>
                )}
              </div>

              {/* Name + Username */}
              {isEditing ? (
                <div className="space-y-3 mb-3">
                  <div>
                    <label className="text-gray-500 text-[13px] mb-1 block">Display name</label>
                    <input
                      value={editDisplayName}
                      onChange={e => setEditDisplayName(e.target.value.slice(0, 50))}
                      className="w-full bg-transparent border border-gray-700 focus:border-[#1d9bf0] rounded-lg px-3 py-2 text-white text-[15px] outline-none transition"
                      placeholder="Display name"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-[13px] mb-1 block">Bio</label>
                    <textarea
                      value={editBio}
                      onChange={e => setEditBio(e.target.value.slice(0, 160))}
                      rows={3}
                      className="w-full bg-transparent border border-gray-700 focus:border-[#1d9bf0] rounded-lg px-3 py-2 text-white text-[15px] outline-none resize-none transition"
                      placeholder="Tell people a little about yourself"
                    />
                    <p className="text-gray-500 text-[12px] text-right">{editBio.length}/160</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xl font-bold leading-tight">{displayName}</p>
                  <p className="text-gray-500 text-[15px] mb-2">@{profile.username.toLowerCase()}</p>
                  {profile.bio && (
                    <p className="text-[15px] leading-relaxed mb-3 break-words">{profile.bio}</p>
                  )}
                  <div className="flex items-center gap-1 text-gray-500 text-[15px] mb-3">
                    <CalendarDays size={16} className="flex-shrink-0" />
                    <span>Joined {formatJoinDate(profile.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-5 text-[15px] mb-1">
                    <button
                      onClick={() => setActiveTab('following')}
                      className="hover:underline"
                    >
                      <span className="font-bold text-white">{followingCount}</span>
                      <span className="text-gray-500 ml-1">Following</span>
                    </button>
                    <span>
                      <span className="font-bold text-white">{followersCount}</span>
                      <span className="text-gray-500 ml-1">Followers</span>
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              {(['posts', 'likes', 'following'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-4 text-[15px] capitalize hover:bg-gray-900/50 transition relative font-medium
                    ${activeTab === tab ? 'font-bold text-white' : 'text-gray-500'}`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-[#1d9bf0] rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Following list */}
            {activeTab === 'following' && (
              followingList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                  <p className="text-xl font-bold mb-1">Not following anyone</p>
                  <p className="text-gray-500 text-[15px]">
                    {isOwnProfile ? "Follow people to see their posts." : `${displayName} isn't following anyone yet.`}
                  </p>
                </div>
              ) : (
                followingList.map(u => {
                  const uDisplayName = u.display_name || u.username
                  return (
                    <div
                      key={u.id}
                      className="flex items-start gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
                      onClick={() => { onClose(); setTimeout(() => window.dispatchEvent(new CustomEvent('open-profile', { detail: u.username })), 50) }}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 overflow-hidden">
                        {u.avatar
                          ? <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                          : <span className="flex items-center justify-center w-full h-full">🔥</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] truncate">{uDisplayName}</p>
                        <p className="text-gray-500 text-[15px] truncate">@{u.username.toLowerCase()}</p>
                        {u.bio && <p className="text-[15px] text-gray-300 mt-1 line-clamp-2">{u.bio}</p>}
                      </div>
                    </div>
                  )
                })
              )
            )}

            {/* Posts / Likes feed */}
            {activeTab !== 'following' && (
              activePosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                  <p className="text-xl font-bold mb-1">
                    {activeTab === 'posts' ? 'No posts yet' : 'No liked posts'}
                  </p>
                  <p className="text-gray-500 text-[15px]">
                    {activeTab === 'posts'
                      ? (isOwnProfile ? 'Share your first secret!' : `${displayName} hasn't posted yet.`)
                      : (isOwnProfile ? "Posts you like will show here." : `${displayName} hasn't liked anything yet.`)}
                  </p>
                </div>
              ) : (
                activePosts.map(post => {
                  const userData = Array.isArray(post.user) ? post.user[0] : post.user
                  const isLiked = likedPosts.has(post.id)
                  const isReposted = repostedPostIds.has(post.id)
                  const repostCount = repostCounts[post.id] || 0
                  const isOwnPost = currentUser?.id === post.user_id
                  return (
                    <article
                      key={post.id}
                      onClick={() => onPostClick(post)}
                      className="flex gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 overflow-hidden">
                        {userData?.avatar
                          ? <img src={userData.avatar} alt={userData.username} className="w-full h-full object-cover" />
                          : <span className="flex items-center justify-center w-full h-full">🔥</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0 mb-0.5">
                          <span className="font-bold text-[15px] truncate">{userData?.username || 'Anonymous'}</span>
                          <span className="text-gray-500 text-[15px]">·</span>
                          <span className="text-gray-500 text-[15px] flex-shrink-0">{formatTime(post.created_at)}</span>
                        </div>
                        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{post.text}</p>
                        {post.image && (
                          <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                            <img src={post.image} alt="Post" className="w-full h-auto object-cover" />
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3 text-gray-500 max-w-[425px]">
                          <button
                            onClick={e => { e.stopPropagation(); onPostClick(post) }}
                            className="group flex items-center gap-2 hover:text-[#1d9bf0] transition"
                          >
                            <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                              <MessageCircle size={18} />
                            </span>
                            <span className="text-sm">{post.replies_count || 0}</span>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); onRepost(post.id, post.user_id) }}
                            disabled={isOwnPost}
                            className={`group flex items-center gap-2 transition
                              ${isOwnPost ? 'opacity-30 cursor-not-allowed' : isReposted ? 'text-green-400' : 'hover:text-green-400'}`}
                          >
                            <span className={`p-2 rounded-full transition ${!isOwnPost ? 'group-hover:bg-green-400/10' : ''}`}>
                              <Repeat2 size={18} />
                            </span>
                            <span className="text-sm">{repostCount}</span>
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); currentUser ? onLike(post.id, post.likes) : onShowAuth() }}
                            className={`group flex items-center gap-2 transition ${isLiked ? 'text-pink-500' : 'hover:text-pink-500'}`}
                          >
                            <span className="p-2 rounded-full group-hover:bg-pink-500/10 transition">
                              <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                            </span>
                            <span className="text-sm">{post.likes}</span>
                          </button>
                          <button className="group flex items-center gap-2 hover:text-[#1d9bf0] transition">
                            <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                              <Share2 size={18} />
                            </span>
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })
              )
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <p className="text-xl font-bold mb-1">User not found</p>
            <p className="text-gray-500 text-[15px]">This account doesn't exist.</p>
          </div>
        )}
      </div>
    </div>
  )
}