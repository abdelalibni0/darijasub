CREATE TABLE scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  platform TEXT NOT NULL, -- 'tiktok', 'facebook', 'instagram', 'youtube', 'youtube_shorts', 'x'
  scheduled_at TIMESTAMPTZ NOT NULL,
  caption TEXT,
  hashtags TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'ready', 'posted'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scheduled posts" ON scheduled_posts
  FOR ALL USING (auth.uid() = user_id);
