-- ==============================================================================
-- MangaHub Tracker: Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor (free tier) to create tables & policies.
-- ==============================================================================

-- 1. Create Mangas table
CREATE TABLE IF NOT EXISTS public.mangas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    alt_title TEXT,
    cover_url TEXT,
    current_chapter NUMERIC NOT NULL DEFAULT 1,
    latest_available_chapter NUMERIC,
    status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'on_hold', 'completed', 'plan_to_read')),
    tier TEXT DEFAULT 'none',
    notes TEXT,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Manga Sources table (Multi-Source URLs per Manga)
CREATE TABLE IF NOT EXISTS public.manga_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manga_id UUID NOT NULL REFERENCES public.mangas(id) ON DELETE CASCADE,
    site_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    current_chapter_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create indexes for high performance
CREATE INDEX IF NOT EXISTS idx_mangas_last_read ON public.mangas(last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_mangas_status ON public.mangas(status);
CREATE INDEX IF NOT EXISTS idx_manga_sources_manga_id ON public.manga_sources(manga_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.mangas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manga_sources ENABLE ROW LEVEL SECURITY;

-- 5. Open policy for personal usage via Anon API Key
CREATE POLICY "Allow anon all operations on mangas"
    ON public.mangas
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow anon all operations on manga_sources"
    ON public.manga_sources
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. Enable Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.mangas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manga_sources;
