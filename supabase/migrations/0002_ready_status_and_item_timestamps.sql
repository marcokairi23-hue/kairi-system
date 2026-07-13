ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_install' AFTER 'in_production';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS order_items_created_at_idx
  ON public.order_items (created_at DESC);

CREATE INDEX IF NOT EXISTS order_items_status_idx
  ON public.order_items (item_status);