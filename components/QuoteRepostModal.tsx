'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Image } from 'lucide-react';

interface Post {
  id: string;
  text: string;
  image?: string;
  likes: number;
  replies_count: number;
  reposts_count: number;
  created_at: string;
  users: {
    id: string;
    username: string;
    avatar?: string | null;
  };
}

interface QuoteRepostModalProps {
  post: Post;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function QuoteRepostModal({ post, onClose, onSuccess }: QuoteRepostModalProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ username: string; avatar?: string | null } | null>(null);
  const MAX_CHARS = 280;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        const { data: profile } = await supabase
          .from('users')
          .select('username, avatar')
          .eq('id', data.user.id)
          .single();
        if (profile) setUserProfile(profile);
      }
    });
  }, []);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
  };

  const handleSubmit = async () => {
    if (!userId || !text.trim()) return;
    setLoading(true);

    let imageUrl: string | null = null;

    // Upload image if any
    if (image) {
      const ext = image.name.split('.').pop();
      const path = `posts/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, image);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }
    }

    // Insert new post with quote_post_id
    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      text: text.trim(),
      image: imageUrl,
      quote_post_id: post.id,
    });

    if (!error) {
      // Also insert into reposts table to track
      await supabase.from('reposts').upsert({ user_id: userId, post_id: post.id });
      onSuccess?.();
      onClose();
    }
    setLoading(false);
  };

  const charsLeft = MAX_CHARS - text.length;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-12 px-4">
      <div className="bg-black border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-bold">Quote post</h2>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || loading || charsLeft < 0}
            className="bg-white text-black font-bold text-sm px-5 py-1.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
          >
            {loading ? 'Posting...' : 'Post'}
          </button>
        </div>

        {/* Composer */}
        <div className="px-4 pt-4">
          <div className="flex gap-3">
            {/* Avatar */}
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
                🔥
              </div>
            )}

            <div className="flex-1 min-w-0">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a comment..."
                maxLength={MAX_CHARS + 10}
                rows={3}
                className="w-full bg-transparent resize-none outline-none text-base placeholder-gray-600 text-white"
                autoFocus
              />

              {/* Image preview */}
              {imagePreview && (
                <div className="relative mt-2 rounded-2xl overflow-hidden border border-gray-700">
                  <img src={imagePreview} alt="preview" className="w-full max-h-48 object-cover" />
                  <button
                    onClick={removeImage}
                    className="absolute top-2 right-2 bg-black/70 rounded-full p-1 hover:bg-black transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Quoted post preview */}
              <div className="mt-3 mb-1 border border-gray-700 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  {post.users?.avatar ? (
                    <img src={post.users.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                      🔥
                    </div>
                  )}
                  <span className="font-bold text-sm">{post.users?.username}</span>
                  <span className="text-gray-500 text-sm">@{post.users?.username}</span>
                  <span className="text-gray-600 text-sm">·</span>
                  <span className="text-gray-500 text-sm">{formatDate(post.created_at)}</span>
                </div>
                <p className="text-sm text-gray-200 line-clamp-3">{post.text}</p>
                {post.image && (
                  <img src={post.image} alt="" className="mt-2 rounded-xl w-full max-h-32 object-cover" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 mt-2">
          <label className="cursor-pointer p-2 rounded-full hover:bg-sky-500/10 text-sky-400 transition-colors">
            <Image className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </label>

          {/* Char counter */}
          <div className="flex items-center gap-3">
            {text.length > 0 && (
              <div className="relative w-6 h-6">
                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="#374151" strokeWidth="2.5" />
                  <circle
                    cx="12" cy="12" r="10"
                    fill="none"
                    stroke={charsLeft < 20 ? (charsLeft < 0 ? '#ef4444' : '#f59e0b') : '#1d9bf0'}
                    strokeWidth="2.5"
                    strokeDasharray={`${Math.min(2 * Math.PI * 10 * (text.length / MAX_CHARS), 2 * Math.PI * 10)} ${2 * Math.PI * 10}`}
                  />
                </svg>
                {charsLeft <= 20 && (
                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${charsLeft < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {charsLeft}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}