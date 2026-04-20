'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import {
  Heart, MessageCircle, Share2, Repeat2, Search, Bell, Mail, Bookmark,
  User, MoreHorizontal, Image as ImageIcon, Smile, X, Trash2,
  LogOut, AlertTriangle, CalendarDays
} from 'lucide-react'
import AuthModal from '@/components/AuthModal'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'
import PostDetail from '@/components/PostDetail'
import ProfileModal from '@/components/ProfileModal'
import BookmarksPage from '@/components/BookmarksPage'
import MessagePage from '@/components/MessagePage'
import NotificationsPage from '@/components/NotificationsPage'
import { useRouter, useSearchParams } from 'next/navigation'

interface Post {
  id: string
  user_id: string
  text: string
  image: string | null
  likes: number
  replies_count: number
  created_at: string
  user: {
    username: string
    avatar: string | null
  }
}

interface FeedItem {
  post: Post
  isRepost: boolean
  repostId?: string
  repostedBy?: string
  repostedAt?: string
  repostCount: number
}

export default function SecretCircle() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [showAuthModal, setShowAuthModal] = useState(!user && !authLoading)
  const [newPostText, setNewPostText] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set())
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set())
const router = useRouter()
const searchParams = useSearchParams()
const [activeNav, setActiveNav] = useState(() => searchParams.get('tab') || 'Home')
  const [activeTab, setActiveTab] = useState<'foryou' | 'following'>('foryou')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  const [profileUsername, setProfileUsername] = useState<string | null>(null)

  useEffect(() => {
    function handleOpenProfile(e: Event) {
      const username = (e as CustomEvent).detail
      if (username) setProfileUsername(username)
    }
    window.addEventListener('open-profile', handleOpenProfile)
    return () => window.removeEventListener('open-profile', handleOpenProfile)
  }, [])

  const [repostedPostIds, setRepostedPostIds] = useState<Set<string>>(new Set())
  const [repostCounts, setRepostCounts] = useState<Record<string, number>>({})
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set())

  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Explore / Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTab, setSearchTab] = useState<'posts' | 'people'>('posts')
  const [searchPostResults, setSearchPostResults] = useState<Post[]>([])
  const [searchPeopleResults, setSearchPeopleResults] = useState<{ id: string; username: string; avatar: string | null }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([])

  // Close dropdown when clicking outside or scrolling
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-menu]')) {
        setOpenMenuPostId(null)
        setMenuPosition(null)
      }
    }
    function handleScroll() {
      setOpenMenuPostId(null)
      setMenuPosition(null)
    }
    if (openMenuPostId) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('scroll', handleScroll, true)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [openMenuPostId])

  useEffect(() => {
    if (!authLoading) {
      fetchPosts()
      const channel = supabase
        .channel('posts-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () =>
          fetchPosts()
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
  }, [authLoading])

  useEffect(() => {
    if (user) {
      loadLikedPosts()
      loadFollowedUsers()
      loadBookmarkedPosts()

    } else {
      setLikedPosts(new Set())
      setFollowedUserIds(new Set())
      setBookmarkedPosts(new Set())

    }
  }, [user])

  useEffect(() => {
    setShowAuthModal(!user && !authLoading)
  }, [user, authLoading])

  // Load trending hashtags when Explore is opened
  useEffect(() => {
    if (activeNav === 'Explore') loadTrendingHashtags()
  }, [activeNav])

  // Debounced search
  useEffect(() => {
    if (activeNav !== 'Explore') return
    const timer = setTimeout(() => runSearch(searchQuery), 350)
    return () => clearTimeout(timer)
  }, [searchQuery, searchTab, activeNav])

  async function loadLikedPosts() {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)
      if (error) throw error
      setLikedPosts(new Set(data.map(l => l.post_id as string)))
    } catch (err) {
      console.error('Error loading liked posts:', err)
    }
  }

  async function loadBookmarkedPosts() {
  if (!user) return
  const { data } = await supabase
    .from('bookmarks')
    .select('post_id')
    .eq('user_id', user.id)
  if (data) setBookmarkedPosts(new Set(data.map(b => b.post_id as string)))
}

async function toggleBookmark(postId: string) {
  if (!user) { setShowAuthModal(true); return }
  const isBookmarked = bookmarkedPosts.has(postId)

  // Optimistic update
  setBookmarkedPosts(prev => {
    const updated = new Set(prev)
    isBookmarked ? updated.delete(postId) : updated.add(postId)
    return updated
  })

  if (isBookmarked) {
    await supabase.from('bookmarks').delete()
      .eq('user_id', user.id).eq('post_id', postId)
  } else {
    await supabase.from('bookmarks').insert({ user_id: user.id, post_id: postId })
  }
}

  async function loadFollowedUsers() {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      if (error) throw error
      setFollowedUserIds(new Set(data.map(f => f.following_id as string)))
    } catch (err) {
      console.error('Error loading followed users:', err)
    }
  }

  async function toggleFollowUser(targetUserId: string) {
    if (!user) { setShowAuthModal(true); return }
    if (user.id === targetUserId) return

    const isFollowing = followedUserIds.has(targetUserId)

    // Optimistic update
    setFollowedUserIds(prev => {
      const updated = new Set(prev)
      isFollowing ? updated.delete(targetUserId) : updated.add(targetUserId)
      return updated
    })
    setOpenMenuPostId(null)

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetUserId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetUserId })
        if (error && error.code !== '23505') throw error
      }
    } catch (err) {
      console.error('Error toggling follow:', err)
      // Revert
      setFollowedUserIds(prev => {
        const u = new Set(prev)
        isFollowing ? u.add(targetUserId) : u.delete(targetUserId)
        return u
      })
    }
  }

  // Load trending hashtags from all posts
  async function loadTrendingHashtags() {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('text')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const tagCount: Record<string, number> = {}
      for (const row of data || []) {
        const matches = row.text.match(/#[\w\u0080-\uFFFF]+/g) || []
        for (const tag of matches) {
          const normalized = tag.toLowerCase()
          tagCount[normalized] = (tagCount[normalized] || 0) + 1
        }
      }
      const sorted = Object.entries(tagCount)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
      setTrendingHashtags(sorted)
    } catch (err) {
      console.error('Error loading trending hashtags:', err)
    }
  }

  async function runSearch(query: string) {
    const q = query.trim()
    if (!q) {
      setSearchPostResults([])
      setSearchPeopleResults([])
      return
    }
    setSearchLoading(true)
    try {
      if (searchTab === 'posts') {
        const { data, error } = await supabase
          .from('posts')
          .select('*, user:user_id(username, avatar)')
          .ilike('text', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(30)
        if (error) throw error
        setSearchPostResults(data || [])
      } else {
        const { data, error } = await supabase
          .from('users')
          .select('id, username, avatar')
          .ilike('username', `%${q}%`)
          .limit(20)
        if (error) throw error
        setSearchPeopleResults(data || [])
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setSearchLoading(false)
    }
  }

  async function fetchPosts() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('posts')
        .select('*, user:user_id(username, avatar)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const fetchedPosts = data || []
      setPosts(fetchedPosts)

      let repostsData: any[] = []
      try {
        const { data: rpData, error: repostsError } = await supabase
          .from('reposts')
          .select('id, user_id, post_id, created_at')
          .order('created_at', { ascending: false })
        if (repostsError) {
          console.warn('Reposts table not ready yet, skipping:', repostsError.message)
        } else {
          const reposterIds = [...new Set((rpData || []).map((r: any) => r.user_id))]
          let usernameMap: Record<string, string> = {}
          if (reposterIds.length > 0) {
            const { data: usersData } = await supabase
              .from('users')
              .select('id, username')
              .in('id', reposterIds)
            for (const u of usersData || []) {
              usernameMap[u.id] = u.username
            }
          }
          repostsData = (rpData || []).map((r: any) => ({
            ...r,
            reposter: { username: usernameMap[r.user_id] || 'Someone' },
          }))
        }
      } catch (rpErr) {
        console.warn('Could not fetch reposts:', rpErr)
      }

      const countMap: Record<string, number> = {}
      for (const rp of repostsData) {
        countMap[rp.post_id] = (countMap[rp.post_id] || 0) + 1
      }
      setRepostCounts(countMap)

      if (user) {
        const userRepostIds = new Set(
          repostsData
            .filter(rp => rp.user_id === user.id)
            .map(rp => rp.post_id as string)
        )
        setRepostedPostIds(userRepostIds)
      }

      buildFeed(fetchedPosts, repostsData, countMap)

      if (user) await loadLikedPosts()
    } catch (err) {
      console.error('Error fetching posts:', err)
    } finally {
      setLoading(false)
    }
  }

  function buildFeed(
    allPosts: Post[],
    allReposts: any[],
    countMap: Record<string, number>
  ) {
    const postMap = new Map(allPosts.map(p => [p.id, p]))
    const items: FeedItem[] = []

    for (const post of allPosts) {
      items.push({
        post,
        isRepost: false,
        repostCount: countMap[post.id] || 0,
      })
    }

    for (const rp of allReposts) {
      const originalPost = postMap.get(rp.post_id)
      if (!originalPost) continue
      items.push({
        post: originalPost,
        isRepost: true,
        repostId: rp.id,
        repostedBy: rp.reposter?.username || 'Someone',
        repostedAt: rp.created_at,
        repostCount: countMap[rp.post_id] || 0,
      })
    }

    items.sort((a, b) => {
      const dateA = a.isRepost ? a.repostedAt! : a.post.created_at
      const dateB = b.isRepost ? b.repostedAt! : b.post.created_at
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

    const seen = new Set<string>()
    const deduped = items.filter(item => {
      const key = `${item.post.id}-${item.isRepost ? item.repostId : 'original'}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setFeedItems(deduped)
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      if (!file) throw new Error('No file selected')
      if (file.size > 5 * 1024 * 1024) throw new Error('File too large (max 5MB)')
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const fileExt = file.name.split('.').pop()?.toLowerCase()
      const filePath = `${fileName}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadError) { alert(`Upload failed: ${uploadError.message}`); return null }
      const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(filePath)
      return urlData.publicUrl
    } catch (err: any) {
      console.error('Error uploading image:', err)
      alert(`Error: ${err.message}`)
      return null
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be less than 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function createPost() {
    if (!user) { setShowAuthModal(true); return }
    if (!newPostText.trim()) return
    setPosting(true)
    try {
      let imageUrl: string | null = null
      if (imageFile) { imageUrl = await uploadImage(imageFile) }
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        text: newPostText.trim(),
        image: imageUrl,
        likes: 0,
      })
      if (error) throw error
      setNewPostText('')
      setImagePreview(null)
      setImageFile(null)
      await fetchPosts()
    } catch (err) {
      console.error('Error creating post:', err)
    } finally {
      setPosting(false)
    }
  }

  async function deletePost(postId: string) {
    if (!user) return
    setDeleting(true)

    const postToDelete = posts.find(p => p.id === postId)

    setPosts(prev => prev.filter(p => p.id !== postId))
    setFeedItems(prev => prev.filter(item => item.post.id !== postId))
    if (selectedPost?.id === postId) setSelectedPost(null)

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id)
      if (error) throw error

      if (postToDelete?.image) {
        try {
          const url = new URL(postToDelete.image)
          const pathParts = url.pathname.split('/post-images/')
          if (pathParts.length > 1) {
            await supabase.storage.from('post-images').remove([pathParts[1]])
          }
        } catch (imgErr) {
          console.warn('Could not delete image from storage:', imgErr)
        }
      }

      await supabase.from('likes').delete().eq('post_id', postId)
      await supabase.from('replies').delete().eq('post_id', postId)
    } catch (err) {
      console.error('Error deleting post:', err)
      await fetchPosts()
    } finally {
      setDeleting(false)
      setConfirmDeletePostId(null)
      setOpenMenuPostId(null)
    }
  }

  async function toggleRepost(postId: string, postOwnerId: string) {
    if (!user) { setShowAuthModal(true); return }
    if (user.id === postOwnerId) return

    const isReposted = repostedPostIds.has(postId)
    const currentCount = repostCounts[postId] || 0

    setRepostedPostIds(prev => {
      const updated = new Set(prev)
      isReposted ? updated.delete(postId) : updated.add(postId)
      return updated
    })
    setRepostCounts(prev => ({
      ...prev,
      [postId]: isReposted ? Math.max(0, currentCount - 1) : currentCount + 1,
    }))
    setFeedItems(prev =>
      prev.map(item =>
        item.post.id === postId
          ? { ...item, repostCount: isReposted ? Math.max(0, currentCount - 1) : currentCount + 1 }
          : item
      )
    )

    try {
      if (isReposted) {
        const { error } = await supabase
          .from('reposts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
        if (error) throw new Error(`Delete repost failed: ${error.message}`)
      } else {
        const { error } = await supabase
          .from('reposts')
          .insert({ user_id: user.id, post_id: postId })
        if (error && error.code !== '23505') {
          throw new Error(`Insert repost failed: ${error.message}`)
        }
      }
    } catch (err) {
      console.error('Error toggling repost:', err)
      setRepostedPostIds(prev => {
        const u = new Set(prev)
        isReposted ? u.add(postId) : u.delete(postId)
        return u
      })
      setRepostCounts(prev => ({ ...prev, [postId]: currentCount }))
      setFeedItems(prev =>
        prev.map(item =>
          item.post.id === postId ? { ...item, repostCount: currentCount } : item
        )
      )
    }
  }

  async function toggleLike(postId: string, currentLikes: number) {
    if (!user) { setShowAuthModal(true); return }
    const isLiked = likedPosts.has(postId)
    setLikedPosts(prev => {
      const updated = new Set(prev)
      isLiked ? updated.delete(postId) : updated.add(postId)
      return updated
    })
    setPosts(prev =>
      prev.map(p => p.id === postId ? { ...p, likes: isLiked ? currentLikes - 1 : currentLikes + 1 } : p)
    )
    setSelectedPost(prev =>
      prev?.id === postId ? { ...prev, likes: isLiked ? currentLikes - 1 : currentLikes + 1 } : prev
    )
    try {
      if (isLiked) {
        const { error } = await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', postId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('likes').upsert(
          { user_id: user.id, post_id: postId },
          { onConflict: 'user_id,post_id', ignoreDuplicates: true }
        )
        if (error) throw error
      }
    } catch (err) {
      console.error('Error toggling like:', err)
      setLikedPosts(prev => { const u = new Set(prev); isLiked ? u.add(postId) : u.delete(postId); return u })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: currentLikes } : p))
      setSelectedPost(prev => prev?.id === postId ? { ...prev, likes: currentLikes } : prev)
    }
  }

  async function sharePost(post: Post) {
    if (navigator.share) {
      await navigator.share({ title: 'SecretCircle', text: post.text, url: window.location.href })
    } else {
      await navigator.clipboard.writeText(post.text)
      alert('Copied to clipboard!')
    }
  }

  const displayedFeedItems =
    activeTab === 'following'
      ? feedItems.filter(item => followedUserIds.has(item.post.user_id))
      : feedItems

  const navItems = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
          <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h4a1 1 0 001-1v-5h3v5a1 1 0 001 1h4c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696z" />
        </svg>
      ),
      label: 'Home',
    },
    { icon: <Search size={27} />, label: 'Explore' },
    { icon: <Bell size={27} />, label: 'Notifications' },
    { icon: <Mail size={27} />, label: 'Messages' },
    { icon: <Bookmark size={27} />, label: 'Bookmarks' },
    { icon: <User size={27} />, label: 'Profile' },
  ]

  const charLimit = 280
  const charLeft = charLimit - newPostText.length
  const charPercent = Math.min((newPostText.length / charLimit) * 100, 100)
  const circleColor = charLeft <= 20 ? '#f4212e' : charLeft <= 60 ? '#ffd400' : '#1d9bf0'

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🔥</div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white flex justify-center font-['TwitterChirp',system-ui,sans-serif]">
      <div className="flex w-full max-w-[1265px]">

        {/* LEFT SIDEBAR */}
        <div className="w-[88px] xl:w-[275px] shrink-0 flex flex-col items-center xl:items-start px-2 xl:px-4 py-2 sticky top-0 h-screen border-r border-gray-800">
          <div className="p-3 rounded-full hover:bg-gray-900 cursor-pointer mb-1">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.892-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>

          <nav className="flex flex-col gap-1 w-full">
            {navItems.map(({ icon, label }) => (
              <button
                key={label}
                onClick={() => {
                  setActiveNav(label)
                  if (label === 'Profile' && user) setProfileUsername(user.username)
                  if (label === 'Explore') {
                    setSearchQuery('')
                    setSearchPostResults([])
                    setSearchPeopleResults([])
                    setSearchTab('posts')
                  }
                }}
                className={`flex items-center gap-5 px-3 py-3 rounded-full hover:bg-gray-900 transition w-full text-left text-xl ${activeNav === label ? 'font-bold' : 'font-normal'}`}
              >
                <span className="flex-shrink-0">{icon}</span>
                <span className="hidden xl:block">{label}</span>
              </button>
            ))}
          </nav>

          {!user ? (
            <div className="mt-auto space-y-3 w-full">
              <button onClick={() => setShowAuthModal(true)} className="w-full border border-[#1d9bf0] text-[#1d9bf0] hover:bg-[#1d9bf0]/10 font-bold text-lg py-3 rounded-full transition hidden xl:block">
                Sign in
              </button>
              <button onClick={() => setShowAuthModal(true)} className="w-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold text-lg py-3 rounded-full transition hidden xl:block">
                Sign up
              </button>
              <button onClick={() => setShowAuthModal(true)} className="w-full xl:hidden bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold py-3 rounded-full transition text-2xl">
                →
              </button>
            </div>
          ) : (
            <div className="mt-auto mb-4 flex items-center gap-3 p-3 rounded-full hover:bg-gray-900 cursor-pointer w-full group">
              {user.avatar && (
                <img src={user.avatar} alt={user.username} className="w-10 h-10 rounded-full flex-shrink-0" />
              )}
              <div className="hidden xl:block overflow-hidden">
                <p className="font-bold text-sm truncate">{user.username}</p>
                <p className="text-gray-500 text-sm truncate">@{user.username.toLowerCase()}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="hidden group-hover:flex ml-auto text-red-500 hover:bg-red-500/10 p-2 rounded-full transition"
                title="Sign Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>

        {/* MAIN FEED */}
        <main className="flex-1 border-x border-gray-800 min-h-screen max-w-[598px]">

          {/* ═══════════════════ EXPLORE PAGE ═══════════════════ */}
          {activeNav === 'Explore' && (
            <>
              {/* Sticky search bar */}
              <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md px-4 py-3 border-b border-gray-800">
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search SecretCircle"
                    className="w-full bg-gray-900 text-white placeholder-gray-500 rounded-full pl-11 pr-10 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#1d9bf0] transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchPostResults([]); setSearchPeopleResults([]) }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {/* Tabs */}
                {searchQuery.trim() && (
                  <div className="flex mt-2 -mx-4 border-b border-gray-800">
                    <button
                      onClick={() => setSearchTab('posts')}
                      className={`flex-1 py-3 text-[15px] hover:bg-gray-900/50 transition relative ${searchTab === 'posts' ? 'font-bold text-white' : 'text-gray-500'}`}
                    >
                      Posts
                      {searchTab === 'posts' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />}
                    </button>
                    <button
                      onClick={() => setSearchTab('people')}
                      className={`flex-1 py-3 text-[15px] hover:bg-gray-900/50 transition relative ${searchTab === 'people' ? 'font-bold text-white' : 'text-gray-500'}`}
                    >
                      People
                      {searchTab === 'people' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-[#1d9bf0] rounded-full" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Default — trending hashtags */}
              {!searchQuery.trim() && (
                <div>
                  <h2 className="px-4 pt-4 pb-2 text-xl font-extrabold">Trending</h2>
                  {trendingHashtags.length === 0 ? (
                    <div className="px-4 py-10 text-center text-gray-500 text-[15px]">
                      No trending topics yet. Start posting with hashtags!
                    </div>
                  ) : (
                    trendingHashtags.map(({ tag, count }) => (
                      <button
                        key={tag}
                        onClick={() => { setSearchQuery(tag); setSearchTab('posts') }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition border-b border-gray-800/50 text-left"
                      >
                        <div>
                          <p className="text-gray-500 text-[13px]">Trending</p>
                          <p className="font-bold text-[15px] text-[#1d9bf0]">{tag}</p>
                          <p className="text-gray-500 text-[13px]">{count} {count === 1 ? 'post' : 'posts'}</p>
                        </div>
                        <Search size={16} className="text-gray-600 flex-shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Loading spinner */}
              {searchQuery.trim() && searchLoading && (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[#1d9bf0] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Posts results */}
              {searchQuery.trim() && !searchLoading && searchTab === 'posts' && (
                <>
                  {searchPostResults.length === 0 ? (
                    <div className="py-16 text-center px-8">
                      <p className="text-xl font-bold mb-1">No results for "{searchQuery}"</p>
                      <p className="text-gray-500 text-[15px]">Try different keywords or check your spelling.</p>
                    </div>
                  ) : (
                    searchPostResults.map((post, idx) => {
                      const userData = Array.isArray(post.user) ? post.user[0] : post.user
                      const isReposted = repostedPostIds.has(post.id)
                      const isOwnPost = user?.id === post.user_id
                      const repostCount = repostCounts[post.id] || 0
                      return (
                        <article
                          key={`search-post-${post.id}-${idx}`}
                          onClick={() => setSelectedPost(post)}
                          className="flex gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
                        >
                          <div
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition"
                            onClick={e => { e.stopPropagation(); if (userData?.username) setProfileUsername(userData.username) }}
                          >
                            {userData?.avatar ? <img src={userData.avatar} alt={userData.username} className="w-full h-full" /> : '🔥'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 min-w-0 mb-0.5">
                              <span
                                className="font-bold text-[15px] truncate hover:underline cursor-pointer"
                                onClick={e => { e.stopPropagation(); if (userData?.username) setProfileUsername(userData.username) }}
                              >{userData?.username || 'Anonymous'}</span>
                              <span className="text-gray-500 text-[15px] truncate">@{userData?.username?.toLowerCase() || 'user'}</span>
                              <span className="text-gray-500 text-[15px]">·</span>
                              <span className="text-gray-500 text-[15px] flex-shrink-0">{formatTime(post.created_at)}</span>
                            </div>
                            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                              {post.text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) =>
                                part.toLowerCase() === searchQuery.toLowerCase()
                                  ? <mark key={i} className="bg-[#1d9bf0]/30 text-white rounded px-0.5">{part}</mark>
                                  : part
                              )}
                            </p>
                            {post.image && (
                              <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                                <img src={post.image} alt="Post image" className="w-full h-auto object-cover" />
                              </div>
                            )}
                            <div className="flex items-center gap-6 mt-3 text-gray-500">
                              <span className="flex items-center gap-1.5 text-sm"><MessageCircle size={16} />{post.replies_count || 0}</span>
                              <button
                                onClick={e => { e.stopPropagation(); toggleRepost(post.id, post.user_id) }}
                                disabled={isOwnPost}
                                className={`flex items-center gap-1.5 text-sm transition ${isOwnPost ? 'opacity-30 cursor-not-allowed' : isReposted ? 'text-green-400' : 'hover:text-green-400'}`}
                              >
                                <Repeat2 size={16} />{repostCount}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); toggleLike(post.id, post.likes) }}
                                className={`flex items-center gap-1.5 text-sm transition ${likedPosts.has(post.id) ? 'text-pink-500' : 'hover:text-pink-500'}`}
                              >
                                <Heart size={16} fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} />{post.likes}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })
                  )}
                </>
              )}

              {/* People results */}
              {searchQuery.trim() && !searchLoading && searchTab === 'people' && (
                <>
                  {searchPeopleResults.length === 0 ? (
                    <div className="py-16 text-center px-8">
                      <p className="text-xl font-bold mb-1">No people found for "{searchQuery}"</p>
                      <p className="text-gray-500 text-[15px]">Try a different username.</p>
                    </div>
                  ) : (
                    searchPeopleResults.map(person => {
                      const isFollowing = followedUserIds.has(person.id)
                      const isSelf = user?.id === person.id
                      return (
                        <div
                          key={`search-person-${person.id}`}
                          onClick={() => setProfileUsername(person.username)}
                          className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {person.avatar ? <img src={person.avatar} alt={person.username} className="w-full h-full" /> : '🔥'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[15px] truncate">{person.username}</p>
                            <p className="text-gray-500 text-[14px] truncate">@{person.username.toLowerCase()}</p>
                          </div>
                          {!isSelf && user && (
                            <button
                              onClick={e => { e.stopPropagation(); toggleFollowUser(person.id) }}
                              className={`px-4 py-1.5 rounded-full text-[14px] font-bold transition flex-shrink-0 ${
                                isFollowing
                                  ? 'border border-gray-600 text-white hover:border-red-500 hover:text-red-500 hover:bg-red-500/10'
                                  : 'bg-white text-black hover:bg-gray-200'
                              }`}
                            >
                              {isFollowing ? 'Following' : 'Follow'}
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </>
              )}
            </>
          )}

          {/* ═══════════════════ HOME FEED ═══════════════════ */}
          {activeNav === 'Home' && (
            <>
              <div className="sticky top-0 z-10 bg-black/85 backdrop-blur-md border-b border-gray-800">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('foryou')}
                    className={`flex-1 py-4 text-[15px] hover:bg-gray-900/50 transition relative ${activeTab === 'foryou' ? 'font-bold text-white' : 'font-normal text-gray-500'}`}
                  >
                    For you
                    {activeTab === 'foryou' && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-[#1d9bf0] rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (!user) { setShowAuthModal(true); return }
                      setActiveTab('following')
                    }}
                    className={`flex-1 py-4 text-[15px] hover:bg-gray-900/50 transition relative ${activeTab === 'following' ? 'font-bold text-white' : 'font-normal text-gray-500'}`}
                  >
                    Following
                    {activeTab === 'following' && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-[#1d9bf0] rounded-full" />
                    )}
                  </button>
                </div>
              </div>

          {/* POST COMPOSER */}
          {user && (
            <div className="flex gap-3 p-4 border-b border-gray-800">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user.avatar ? <img src={user.avatar} alt={user.username} className="w-full h-full" /> : '🔥'}
              </div>
              <div className="flex-1">
                <textarea
                  value={newPostText}
                  onChange={e => { if (e.target.value.length <= charLimit) setNewPostText(e.target.value) }}
                  className="w-full bg-transparent text-xl text-white outline-none resize-none min-h-[120px] placeholder-gray-600"
                  placeholder="What's your secret?"
                />
                {imagePreview && (
                  <div className="relative mt-4 rounded-2xl overflow-hidden border border-gray-800">
                    <img src={imagePreview} alt="Preview" className="w-full object-cover max-h-80" />
                    <button
                      onClick={() => { setImagePreview(null); setImageFile(null) }}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black rounded-full w-8 h-8 flex items-center justify-center transition"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                  <div className="flex gap-1 text-[#1d9bf0]">
                    <label className="p-2 rounded-full hover:bg-[#1d9bf0]/10 cursor-pointer transition">
                      <ImageIcon size={20} />
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                    <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition">
                      <Smile size={20} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    {newPostText.length > 0 && (
                      <div className="relative w-8 h-8">
                        <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                          <circle cx="18" cy="18" r="16" fill="none" stroke="#2f3336" strokeWidth="2.5" />
                          <circle
                            cx="18" cy="18" r="16" fill="none"
                            stroke={circleColor} strokeWidth="2.5"
                            strokeDasharray={`${charPercent} 100`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dasharray 0.2s' }}
                          />
                        </svg>
                        {charLeft <= 20 && (
                          <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${charLeft < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {charLeft}
                          </span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={createPost}
                      disabled={posting || !newPostText.trim() || newPostText.length > charLimit}
                      className="bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[15px] px-6 py-2 rounded-full transition"
                    >
                      {posting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOADING SKELETON */}
          {loading && (
            <div className="flex flex-col gap-0">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 p-4 border-b border-gray-800 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-800 flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-gray-800 rounded w-1/4" />
                    <div className="h-3 bg-gray-800 rounded w-full" />
                    <div className="h-3 bg-gray-800 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EMPTY STATE — no posts at all */}
          {!loading && posts.length === 0 && activeTab === 'foryou' && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <p className="text-3xl font-extrabold mb-2">Welcome to SecretCircle</p>
              <p className="text-gray-500 text-[15px]">
                {user ? 'Be the first to share a secret' : 'Sign in to share secrets'}
              </p>
            </div>
          )}

          {/* EMPTY STATE — following tab with no followed users or no posts from them */}
          {!loading && activeTab === 'following' && displayedFeedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <p className="text-2xl font-extrabold mb-2">You're not following anyone yet</p>
              <p className="text-gray-500 text-[15px] max-w-xs">
                {followedUserIds.size === 0
                  ? 'Follow people to see their posts here. Use the ··· menu on any post to follow.'
                  : 'The people you follow haven\'t posted anything yet.'}
              </p>
            </div>
          )}

          {/* POSTS FEED */}
          {displayedFeedItems.map((item, idx) => {
            const { post, isRepost, repostedBy, repostCount } = item
            const userData = Array.isArray(post.user) ? post.user[0] : post.user
            const isOwner = user?.id === post.user_id
            const isReposted = repostedPostIds.has(post.id)
            const isOwnPost = user?.id === post.user_id
            return (
              <article
                key={`${post.id}-${idx}`}
                onClick={() => setSelectedPost(post)}
                className="flex flex-col border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
              >
                {/* Repost banner */}
                {isRepost && (
                  <div className="flex items-center gap-2 pt-3 px-4 pb-0 text-gray-500 text-[13px]">
                    <Repeat2 size={14} className="flex-shrink-0" />
                    <span className="font-semibold truncate">{repostedBy} reposted</span>
                  </div>
                )}

                <div className="flex gap-3 p-4 pt-2">
                  <div
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer hover:opacity-80 transition"
                    onClick={e => { e.stopPropagation(); if (userData?.username) setProfileUsername(userData.username) }}
                  >
                    {userData?.avatar ? (
                      <img src={userData.avatar} alt={userData.username} className="w-full h-full" />
                    ) : '🔥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className="font-bold text-[15px] truncate hover:underline cursor-pointer"
                          onClick={e => { e.stopPropagation(); if (userData?.username) setProfileUsername(userData.username) }}
                        >{userData?.username || 'Anonymous'}</span>
                        <span className="text-gray-500 text-[15px] truncate">@{userData?.username?.toLowerCase() || 'user'}</span>
                        <span className="text-gray-500 text-[15px]">·</span>
                        <span className="text-gray-500 text-[15px] flex-shrink-0">{formatTime(post.created_at)}</span>
                      </div>

                      {/* MORE MENU */}
                      <div className="flex-shrink-0" data-menu>
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (openMenuPostId === post.id) {
                              setOpenMenuPostId(null)
                              setMenuPosition(null)
                            } else {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              setMenuPosition({
                                top: rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                              })
                              setOpenMenuPostId(post.id)
                            }
                          }}
                          className="text-gray-500 hover:text-[#1d9bf0] p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </div>

                    <p className="text-[15px] leading-relaxed mt-0.5 break-words whitespace-pre-wrap">
                      {post.text}
                    </p>

                    {post.image && (
                      <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                        <img src={post.image} alt="Post image" className="w-full h-auto object-cover" />
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3 text-gray-500 max-w-[425px]">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedPost(post) }}
                        className="group flex items-center gap-2 hover:text-[#1d9bf0] transition"
                      >
                        <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                          <MessageCircle size={18} />
                        </span>
                        <span className="text-sm">{post.replies_count || 0}</span>
                      </button>

                      <button
                        onClick={e => {
                          e.stopPropagation()
                          toggleRepost(post.id, post.user_id)
                        }}
                        disabled={isOwnPost}
                        title={isOwnPost ? "Can't repost your own post" : isReposted ? 'Undo repost' : 'Repost'}
                        className={`group flex items-center gap-2 transition
                          ${isOwnPost
                            ? 'opacity-30 cursor-not-allowed text-gray-500'
                            : isReposted
                              ? 'text-green-400'
                              : 'text-gray-500 hover:text-green-400'
                          }`}
                      >
                        <span className={`p-2 rounded-full transition ${!isOwnPost ? 'group-hover:bg-green-400/10' : ''}`}>
                          <Repeat2 size={18} />
                        </span>
                        <span className="text-sm">{repostCount}</span>
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); toggleLike(post.id, post.likes) }}
                        className={`group flex items-center gap-2 transition ${likedPosts.has(post.id) ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'}`}
                      >
                        <span className="p-2 rounded-full group-hover:bg-pink-500/10 transition">
                          <Heart size={18} fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} />
                        </span>
                        <span className="text-sm">{post.likes}</span>
                      </button>

                      <button
  onClick={e => { e.stopPropagation(); toggleBookmark(post.id) }}
  className={`group flex items-center gap-2 transition ${bookmarkedPosts.has(post.id) ? 'text-sky-400' : 'text-gray-500 hover:text-sky-400'}`}
>
  <span className="p-2 rounded-full group-hover:bg-sky-400/10 transition">
    <Bookmark size={18} fill={bookmarkedPosts.has(post.id) ? 'currentColor' : 'none'} />
  </span>
</button>

<button
  onClick={e => { e.stopPropagation(); sharePost(post) }}
  className="group flex items-center gap-2 hover:text-[#1d9bf0] transition"
>
  <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
    <Share2 size={18} />
  </span>
</button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
            </>
          )}
                {activeNav === 'Notifications' && (
                  <NotificationsPage />
                )}

                {activeNav === 'Messages' && (
                  <MessagePage />
                )}

                {activeNav === 'Bookmarks' && (
                  <BookmarksPage />
                )}
        </main>
      </div>

      {/* FLOATING DROPDOWN PORTAL — fixed to viewport, never scrolls */}
      {openMenuPostId && menuPosition && (() => {
        const activeItem = feedItems.find(item => item.post.id === openMenuPostId)
        if (!activeItem) return null
        const { post: activePost } = activeItem
        const activeUser = Array.isArray(activePost.user) ? activePost.user[0] : activePost.user
        const isActiveOwner = user?.id === activePost.user_id
        return (
          <div
            data-menu
            className="fixed z-50 bg-black border border-gray-800 rounded-2xl shadow-2xl w-56 overflow-hidden"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {isActiveOwner ? (
              <button
                onClick={e => {
                  e.stopPropagation()
                  setOpenMenuPostId(null)
                  setMenuPosition(null)
                  setConfirmDeletePostId(activePost.id)
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-500/10 transition text-[15px] font-bold"
              >
                <Trash2 size={18} />
                Delete post
              </button>
            ) : (
              <>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (!user) { setShowAuthModal(true); setOpenMenuPostId(null); setMenuPosition(null); return }
                    toggleFollowUser(activePost.user_id)
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-white hover:bg-white/5 transition text-[15px] font-bold"
                >
                  {followedUserIds.has(activePost.user_id) ? (
                    <>
                      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current flex-shrink-0">
                        <path d="M10 4C7.79 4 6 5.79 6 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm7.76-9.58l-1.41 1.42C17.09 6.54 18 7.67 18 9s-.91 2.46-1.65 3.16l1.41 1.42C19.09 12.5 20 10.86 20 9s-.91-3.5-2.24-4.58zM19.18.4l-1.41 1.42C19.76 3.13 21 5.93 21 9s-1.24 5.87-3.23 7.18l1.41 1.42C21.6 15.83 23 12.6 23 9S21.6 2.17 19.18.4z" />
                      </svg>
                      Unfollow @{activeUser?.username}
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current flex-shrink-0">
                        <path d="M10 4C7.79 4 6 5.79 6 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm9-5h-3v3h-2v-3H11v-2h3V4h2v3h3v2z" />
                      </svg>
                      Follow @{activeUser?.username}
                    </>
                  )}
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    setOpenMenuPostId(null)
                    setMenuPosition(null)
                    if (activeUser?.username) setProfileUsername(activeUser.username)
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-white hover:bg-white/5 transition text-[15px]"
                >
                  <User size={18} />
                  View profile
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* DELETE CONFIRMATION DIALOG */}
      {confirmDeletePostId && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setConfirmDeletePostId(null)}
        >
          <div
            className="bg-black border border-gray-800 rounded-2xl w-full max-w-[320px] mx-4 shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold">Delete post?</h2>
              <p className="text-gray-500 text-[15px] leading-snug">
                This will permanently delete your post. This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={() => deletePost(confirmDeletePostId)}
                disabled={deleting}
                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDeletePostId(null)}
                disabled={deleting}
                className="w-full border border-gray-700 hover:bg-gray-900 disabled:opacity-50 text-white font-bold py-3 rounded-full transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST DETAIL MODAL */}
      {selectedPost && (
        <PostDetail
          post={selectedPost}
          currentUser={user}
          isLiked={likedPosts.has(selectedPost.id)}
          onClose={() => setSelectedPost(null)}
          onLike={toggleLike}
          onShowAuth={() => setShowAuthModal(true)}
        />
      )}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* PROFILE MODAL */}
      {profileUsername && (
        <ProfileModal
          username={profileUsername}
          currentUser={user}
          likedPosts={likedPosts}
          repostedPostIds={repostedPostIds}
          repostCounts={repostCounts}
          onClose={() => setProfileUsername(null)}
          onPostClick={post => { setProfileUsername(null); setSelectedPost(post) }}
          onLike={toggleLike}
          onRepost={toggleRepost}
          onShowAuth={() => setShowAuthModal(true)}
        />
      )}
    </div>
  )
}

function formatTime(dateStr: string): string {
  try {
    const dateStrFixed = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
    const date = new Date(dateStrFixed)
    if (isNaN(date.getTime())) return 'now'
    return formatDistanceToNow(date, { addSuffix: true, locale: id })
  } catch {
    return 'now'
  }
}