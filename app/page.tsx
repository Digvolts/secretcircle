'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import {
  Heart, MessageCircle, Share2, Repeat2, Search, Bell, Mail, Bookmark,
  User, MoreHorizontal, Image as ImageIcon, Smile, X,
  LogOut
} from 'lucide-react'
import AuthModal from '@/components/AuthModal'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'
import PostDetail from '@/components/PostDetail'


interface Post {
  id: string
  user_id: string
  text: string
  image: string | null
  likes: number
  replies_count: number  // tambah ini
  created_at: string
  user: {
    username: string
    avatar: string | null
  }
}

export default function SecretCircle() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [showAuthModal, setShowAuthModal] = useState(!user && !authLoading)
  const [newPostText, setNewPostText] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set())
  const [activeNav, setActiveNav] = useState('Home')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)


  // Fetch posts saat authLoading selesai
  useEffect(() => {
    if (!authLoading) {
      fetchPosts()

      const channel = supabase
        .channel('posts-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () =>
          fetchPosts()
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [authLoading])

  // Load liked posts setiap kali user berubah (login/logout)
  useEffect(() => {
    if (user) {
      loadLikedPosts()
    } else {
      setLikedPosts(new Set())
    }
  }, [user])

  // Show auth modal
  useEffect(() => {
    setShowAuthModal(!user && !authLoading)
  }, [user, authLoading])

  async function loadLikedPosts() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.id)

      if (error) throw error

      const likedSet = new Set(data.map(l => l.post_id as string))
      setLikedPosts(likedSet)
    } catch (err) {
      console.error('Error loading liked posts:', err)
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
      setPosts(data || [])

      // Sync liked posts setiap fetch biar selalu akurat
      if (user) await loadLikedPosts()
    } catch (err) {
      console.error('Error fetching posts:', err)
    } finally {
      setLoading(false)
    }
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
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (uploadError) {
        alert(`Upload failed: ${uploadError.message}`)
        return null
      }

      const { data: urlData } = supabase.storage
        .from('post-images')
        .getPublicUrl(filePath)

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

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function createPost() {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    if (!newPostText.trim()) return

    setPosting(true)
    try {
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage(imageFile)
      }

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

async function toggleLike(postId: string, currentLikes: number) {
  if (!user) {
    setShowAuthModal(true)
    return
  }

  const isLiked = likedPosts.has(postId)

  // Optimistic update posts list
  setLikedPosts(prev => {
    const updated = new Set(prev)
    isLiked ? updated.delete(postId) : updated.add(postId)
    return updated
  })

  setPosts(prev =>
    prev.map(p =>
      p.id === postId
        ? { ...p, likes: isLiked ? currentLikes - 1 : currentLikes + 1 }
        : p
    )
  )

  // Sync selectedPost juga biar PostDetail terupdate
  setSelectedPost(prev =>
    prev?.id === postId
      ? { ...prev, likes: isLiked ? currentLikes - 1 : currentLikes + 1 }
      : prev
  )

  try {
    if (isLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('likes')
        .upsert(
          { user_id: user.id, post_id: postId },
          { onConflict: 'user_id,post_id', ignoreDuplicates: true }
        )

      if (error) throw error
    }
  } catch (err) {
    console.error('Error toggling like:', err)

    // Revert semua
    setLikedPosts(prev => {
      const updated = new Set(prev)
      isLiked ? updated.add(postId) : updated.delete(postId)
      return updated
    })

    setPosts(prev =>
      prev.map(p => p.id === postId ? { ...p, likes: currentLikes } : p)
    )

    setSelectedPost(prev =>
      prev?.id === postId ? { ...prev, likes: currentLikes } : prev
    )
  }
}

  async function sharePost(post: Post) {
    if (navigator.share) {
      await navigator.share({
        title: 'SecretCircle',
        text: post.text,
        url: window.location.href,
      })
    } else {
      await navigator.clipboard.writeText(post.text)
      alert('Copied to clipboard!')
    }
  }

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
  const circleColor =
    charLeft <= 20 ? '#f4212e' : charLeft <= 60 ? '#ffd400' : '#1d9bf0'

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
                onClick={() => setActiveNav(label)}
                className={`flex items-center gap-5 px-3 py-3 rounded-full hover:bg-gray-900 transition w-full text-left text-xl ${
                  activeNav === label ? 'font-bold' : 'font-normal'
                }`}
              >
                <span className="flex-shrink-0">{icon}</span>
                <span className="hidden xl:block">{label}</span>
              </button>
            ))}
          </nav>

          {!user ? (
            <div className="mt-auto space-y-3 w-full">
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full border border-[#1d9bf0] text-[#1d9bf0] hover:bg-[#1d9bf0]/10 font-bold text-lg py-3 rounded-full transition hidden xl:block"
              >
                Sign in
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold text-lg py-3 rounded-full transition hidden xl:block"
              >
                Sign up
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full xl:hidden bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold py-3 rounded-full transition text-2xl"
              >
                →
              </button>
            </div>
          ) : (
            <div className="mt-auto mb-4 flex items-center gap-3 p-3 rounded-full hover:bg-gray-900 cursor-pointer w-full group">
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
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
          <div className="sticky top-0 z-10 bg-black/85 backdrop-blur-md border-b border-gray-800">
            <div className="flex">
              <button className="flex-1 py-4 text-[15px] font-bold hover:bg-gray-900/50 transition relative">
                For you
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-[#1d9bf0] rounded-full" />
              </button>
              <button className="flex-1 py-4 text-[15px] text-gray-500 hover:bg-gray-900/50 transition">
                Following
              </button>
            </div>
          </div>

          {/* POST COMPOSER */}
          {user && (
            <div className="flex gap-3 p-4 border-b border-gray-800">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="w-full h-full" />
                ) : '🔥'}
              </div>
              <div className="flex-1">
                <textarea
                  value={newPostText}
                  onChange={e => {
                    if (e.target.value.length <= charLimit) setNewPostText(e.target.value)
                  }}
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

          {/* EMPTY STATE */}
          {!loading && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <p className="text-3xl font-extrabold mb-2">Welcome to SecretCircle</p>
              <p className="text-gray-500 text-[15px]">
                {user ? 'Be the first to share a secret' : 'Sign in to share secrets'}
              </p>
            </div>
          )}

          {/* POSTS FEED */}
          {posts.map(post => {
            const userData = Array.isArray(post.user) ? post.user[0] : post.user
            return (
              <article
                key={post.id}
                onClick={() => setSelectedPost(post)}  // tambah ini

                className="flex gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer"
              >
                
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {userData?.avatar ? (
                    <img src={userData.avatar} alt={userData.username} className="w-full h-full" />
                  ) : '🔥'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-bold text-[15px] truncate">
                        {userData?.username || 'Anonymous'}
                      </span>
                      <span className="text-gray-500 text-[15px] truncate">
                        @{userData?.username?.toLowerCase() || 'user'}
                      </span>
                      <span className="text-gray-500 text-[15px]">·</span>
                      <span className="text-gray-500 text-[15px] flex-shrink-0">
                        {formatTime(post.created_at)}
                      </span>
                    </div>
                    <button className="text-gray-500 hover:text-[#1d9bf0] p-2 rounded-full transition flex-shrink-0">
                      <MoreHorizontal size={18} />
                    </button>
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
                    onClick={e => {
                      e.stopPropagation()
                      setSelectedPost(post)
                    }}
                    className="group flex items-center gap-2 hover:text-[#1d9bf0] transition"
                  >
                    <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                      <MessageCircle size={18} />
                    </span>
                    <span className="text-sm">{post.replies_count || 0}</span>
                  </button>
                    <button className="group flex items-center gap-2 hover:text-green-400 transition">
                      <span className="p-2 rounded-full group-hover:bg-green-400/10 transition">
                        <Repeat2 size={18} />
                      </span>
                      <span className="text-sm">0</span>
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()  // tambah ini
                        toggleLike(post.id, post.likes)
                      }}
                        className={`group flex items-center gap-2 transition ${
                        likedPosts.has(post.id) ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'
                      }`}
                    >
                      <span className="p-2 rounded-full group-hover:bg-pink-500/10 transition">
                        <Heart size={18} fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} />
                      </span>
                      <span className="text-sm">{post.likes}</span>
                    </button>
                    <button
                      onClick={() => sharePost(post)}
                      className="group flex items-center gap-2 hover:text-[#1d9bf0] transition"
                    >
                      <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                        <Share2 size={18} />
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </main>
      </div>
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