'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import {
  Heart, MessageCircle, Share2, Repeat2,
  Search, Bell, Mail, Bookmark, User,
  MoreHorizontal, Image as ImageIcon, Smile,
  MapPin, BarChart2, X
} from 'lucide-react';
import Image from 'next/image';

interface Post {
  id: string;
  user: string;
  handle: string;
  text: string;
  image: string | null;
  likes: number;
  created_at: string;
}

const supabase = getSupabaseClient();

export default function SecretCircle() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostText, setNewPostText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [activeNav, setActiveNav] = useState('Home');

  useEffect(() => {
    fetchPosts();
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, fetchPosts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchPosts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error(error.message);
    setPosts(data || []);
    setLoading(false);
  }

  async function uploadImage(file: File): Promise<string | null> {
    const fileName = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('post-images').upload(fileName, file);
    if (error) return null;
    const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
    return data.publicUrl;
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Invalid image file.');
    if (file.size > 5 * 1024 * 1024) return alert('Max 5MB.');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function createPost() {
    if (!newPostText.trim()) return;
    setPosting(true);
    let imageUrl: string | null = null;
    if (imageFile) imageUrl = await uploadImage(imageFile);
       const { error } = await (supabase as any).from('posts').insert({
  user: 'Anonymous',
  handle: '@secret',
  text: newPostText.trim(),
  image: imageUrl,
  likes: 0,
});
    if (error) alert('Failed to post.');
    else {
      setNewPostText('');
      setImagePreview(null);
      setImageFile(null);
      setShowModal(false);
    }
    setPosting(false);
  }

  async function toggleLike(post: Post) {
    const liked = likedPosts.has(post.id);
    const newLikes = liked ? post.likes - 1 : post.likes + 1;
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: newLikes } : p));
    setLikedPosts(prev => {
      const updated = new Set(prev);
      liked ? updated.delete(post.id) : updated.add(post.id);
      return updated;
    });
const { error } = await (supabase as any).from('posts').update({ likes: newLikes }).eq('id', post.id);
    if (error) {
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: post.likes } : p));
    }
  }

  async function sharePost(post: Post) {
    if (navigator.share) {
      await navigator.share({ title: 'SecretCircle', text: post.text, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(post.text);
      alert('Copied!');
    }
  }

  const navItems = [
    { icon: <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current"><path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h4a1 1 0 001-1v-5h3v5a1 1 0 001 1h4c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696z"/></svg>, label: 'Home' },
    { icon: <Search size={27} />, label: 'Explore' },
    { icon: <Bell size={27} />, label: 'Notifications' },
    { icon: <Mail size={27} />, label: 'Messages' },
    { icon: <Bookmark size={27} />, label: 'Bookmarks' },
    { icon: <User size={27} />, label: 'Profile' },
  ];

  const charLimit = 280;
  const charLeft = charLimit - newPostText.length;
  const charPercent = Math.min((newPostText.length / charLimit) * 100, 100);
  const circleColor = charLeft <= 20 ? '#f4212e' : charLeft <= 60 ? '#ffd400' : '#1d9bf0';

  return (
    <div className="min-h-screen bg-black text-white flex justify-center font-['TwitterChirp',system-ui,sans-serif]">
      <div className="flex w-full max-w-[1265px]">

        {/* LEFT SIDEBAR */}
        <div className="w-[88px] xl:w-[275px] shrink-0 flex flex-col items-center xl:items-start px-2 xl:px-4 py-2 sticky top-0 h-screen">
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
                className={`flex items-center gap-5 px-3 py-3 rounded-full hover:bg-gray-900 transition w-full text-left text-xl ${activeNav === label ? 'font-bold' : 'font-normal'}`}
              >
                <span className="flex-shrink-0">{icon}</span>
                <span className="hidden xl:block">{label}</span>
              </button>
            ))}
            <button className="flex items-center gap-5 px-3 py-3 rounded-full hover:bg-gray-900 transition text-xl w-full text-left">
              <MoreHorizontal size={27} />
              <span className="hidden xl:block">More</span>
            </button>
          </nav>

          <button
            onClick={() => setShowModal(true)}
            className="mt-4 w-full xl:flex hidden items-center justify-center bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold text-lg py-4 rounded-full transition"
          >
            Post
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 xl:hidden flex items-center justify-center bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold w-14 h-14 rounded-full transition text-2xl"
          >
            +
          </button>

          <div className="mt-auto mb-4 flex items-center gap-3 p-3 rounded-full hover:bg-gray-900 cursor-pointer w-full">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
              🔥
            </div>
            <div className="hidden xl:block overflow-hidden">
              <p className="font-bold text-sm truncate">Anonymous</p>
              <p className="text-gray-500 text-sm truncate">@secret</p>
            </div>
            <MoreHorizontal size={18} className="hidden xl:block ml-auto text-gray-500" />
          </div>
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

          <div className="flex gap-3 p-4 border-b border-gray-800">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              🔥
            </div>
            <div className="flex-1">
              <input
                type="text"
                placeholder="What's your secret?"
                className="w-full bg-transparent text-xl text-gray-500 outline-none py-2 cursor-pointer"
                onClick={() => setShowModal(true)}
                readOnly
              />
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                <div className="flex gap-1 text-[#1d9bf0]">
                  <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><ImageIcon size={20} /></button>
                  <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><Smile size={20} /></button>
                  <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><BarChart2 size={20} /></button>
                  <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><MapPin size={20} /></button>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold text-[15px] px-5 py-2 rounded-full transition"
                >
                  Post
                </button>
              </div>
            </div>
          </div>

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

          {!loading && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-8">
              <p className="text-3xl font-extrabold mb-2">Welcome to SecretCircle</p>
              <p className="text-gray-500 text-[15px]">Drop the first secret. No one knows who you are.</p>
            </div>
          )}

          {posts.map(post => (
            <article key={post.id} className="flex gap-3 p-4 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
                🔥
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-bold text-[15px] truncate">{post.user}</span>
                    <span className="text-gray-500 text-[15px] truncate">{post.handle}</span>
                    <span className="text-gray-500 text-[15px]">·</span>
                    <span className="text-gray-500 text-[15px] flex-shrink-0">{formatTime(post.created_at)}</span>
                  </div>
                  <button className="text-gray-500 hover:text-[#1d9bf0] p-2 rounded-full transition flex-shrink-0">
                    <MoreHorizontal size={18} />
                  </button>
                </div>

                <p className="text-[15px] leading-relaxed mt-0.5 break-words">{post.text}</p>

                {post.image && (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-gray-800">
                    <Image src={post.image} alt="Post image" width={600} height={400} className="w-full h-auto object-cover" unoptimized />
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 text-gray-500 max-w-[425px]">
                  <button className="group flex items-center gap-2 hover:text-[#1d9bf0] transition">
                    <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition"><MessageCircle size={18} /></span>
                    <span className="text-sm">0</span>
                  </button>
                  <button className="group flex items-center gap-2 hover:text-green-400 transition">
                    <span className="p-2 rounded-full group-hover:bg-green-400/10 transition"><Repeat2 size={18} /></span>
                    <span className="text-sm">0</span>
                  </button>
                  <button
                    onClick={() => toggleLike(post)}
                    className={`group flex items-center gap-2 transition ${likedPosts.has(post.id) ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'}`}
                  >
                    <span className="p-2 rounded-full group-hover:bg-pink-500/10 transition">
                      <Heart size={18} fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} />
                    </span>
                    <span className="text-sm">{post.likes}</span>
                  </button>
                  <button onClick={() => sharePost(post)} className="group flex items-center gap-2 hover:text-[#1d9bf0] transition">
                    <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition"><Share2 size={18} /></span>
                  </button>
                  <button className="group flex items-center gap-2 hover:text-[#1d9bf0] transition">
                    <span className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition"><BarChart2 size={18} /></span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </main>

        {/* RIGHT SIDEBAR */}
        <div className="hidden lg:flex flex-col w-[350px] shrink-0 px-6 py-3 sticky top-0 h-screen overflow-y-auto gap-4">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search SecretCircle" className="w-full bg-gray-900 rounded-full py-3 pl-12 pr-4 text-[15px] outline-none focus:ring-2 focus:ring-[#1d9bf0] transition" />
          </div>

          <div className="bg-gray-900 rounded-2xl p-4">
            <h2 className="text-xl font-extrabold mb-2">Subscribe to Premium</h2>
            <p className="text-[15px] text-gray-300 mb-4">Post longer secrets, get a verified badge, and more.</p>
            <button className="bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white font-bold py-2.5 px-5 rounded-full transition text-[15px]">Subscribe</button>
          </div>

          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <h2 className="text-xl font-extrabold p-4">Trends for you</h2>
            {[
              { tag: '#SecretCircle', posts: '12.4K' },
              { tag: '#Anonymous', posts: '8.1K' },
              { tag: '#NGL', posts: '5.7K' },
              { tag: '#HotTea', posts: '3.2K' },
            ].map(({ tag, posts }) => (
              <div key={tag} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 cursor-pointer transition">
                <div>
                  <p className="text-xs text-gray-500">Trending</p>
                  <p className="font-bold text-[15px]">{tag}</p>
                  <p className="text-xs text-gray-500">{posts} posts</p>
                </div>
                <MoreHorizontal size={18} className="text-gray-500" />
              </div>
            ))}
            <button className="w-full text-[#1d9bf0] text-[15px] p-4 text-left hover:bg-white/5 transition">Show more</button>
          </div>

          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <h2 className="text-xl font-extrabold p-4">Who to follow</h2>
            {[
              { name: 'Ghost User', handle: '@ghost_99' },
              { name: 'Shadow Leaks', handle: '@shadow_lk' },
            ].map(({ name, handle }) => (
              <div key={handle} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-lg">👤</div>
                  <div>
                    <p className="font-bold text-[15px]">{name}</p>
                    <p className="text-gray-500 text-sm">{handle}</p>
                  </div>
                </div>
                <button className="bg-white text-black font-bold text-sm px-4 py-1.5 rounded-full hover:bg-gray-200 transition">Follow</button>
              </div>
            ))}
            <button className="w-full text-[#1d9bf0] text-[15px] p-4 text-left hover:bg-white/5 transition">Show more</button>
          </div>
        </div>
      </div>

      {/* POST MODAL */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-16"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-black border border-gray-800 rounded-2xl w-full max-w-[598px] mx-4 shadow-2xl">
            <div className="flex items-center p-3">
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-900 transition">
                <X size={20} />
              </button>
              <button className="ml-auto text-[#1d9bf0] font-bold text-[15px] hover:bg-[#1d9bf0]/10 px-4 py-1.5 rounded-full transition">
                Drafts
              </button>
            </div>

            <div className="flex gap-3 px-4 pb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                🔥
              </div>
              <div className="flex-1">
                <button className="mb-3 border border-[#1d9bf0] text-[#1d9bf0] text-sm font-bold px-3 py-0.5 rounded-full hover:bg-[#1d9bf0]/10 transition">
                  Circle only ▾
                </button>

                <textarea
                  value={newPostText}
                  onChange={e => { if (e.target.value.length <= charLimit) setNewPostText(e.target.value); }}
                  className="w-full bg-transparent text-xl placeholder-gray-600 outline-none resize-none min-h-[120px]"
                  placeholder="What's your secret?"
                  autoFocus
                />

                {imagePreview && (
                  <div className="relative mt-2 rounded-2xl overflow-hidden border border-gray-800">
                    <Image src={imagePreview} alt="Preview" width={500} height={300} className="w-full object-cover max-h-80" unoptimized />
                    <button
                      onClick={() => { setImagePreview(null); setImageFile(null); }}
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
                    <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><Smile size={20} /></button>
                    <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><BarChart2 size={20} /></button>
                    <button className="p-2 rounded-full hover:bg-[#1d9bf0]/10 transition"><MapPin size={20} /></button>
                  </div>

                  <div className="flex items-center gap-4">
                    {newPostText.length > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="relative w-8 h-8">
                          <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                            <circle cx="18" cy="18" r="16" fill="none" stroke="#2f3336" strokeWidth="2.5" />
                            <circle cx="18" cy="18" r="16" fill="none" stroke={circleColor} strokeWidth="2.5" strokeDasharray={`${charPercent} 100`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.2s' }} />
                          </svg>
                          {charLeft <= 20 && (
                            <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${charLeft < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {charLeft}
                            </span>
                          )}
                        </div>
                        <div className="w-px h-8 bg-gray-800" />
                        <button className="w-8 h-8 border border-gray-700 rounded-full flex items-center justify-center text-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition text-lg font-bold">+</button>
                      </div>
                    )}
                    <button
                      onClick={createPost}
                      disabled={posting || !newPostText.trim() || newPostText.length > charLimit}
                      className="bg-[#1d9bf0] hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[15px] px-5 py-2 rounded-full transition"
                    >
                      {posting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}