CREATE TABLE public.guests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    passcode TEXT,
    token TEXT NOT NULL UNIQUE DEFAULT md5(gen_random_uuid()::text),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'confirmed', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own guests"
    ON public.guests FOR ALL
    USING (wedding_id IN (SELECT id FROM public.weddings WHERE user_id = auth.uid()));

CREATE POLICY "Public can view guest by token"
    ON public.guests FOR SELECT
    USING (true);
