import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://prvnbtjjjuejjvzoffmx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBydm5idGpqanVlamp2em9mZm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDQ5MzksImV4cCI6MjA5NjEyMDkzOX0.GJe4cX9KcC2FaHm_KnoX_hvJzQ06FZtoD300HuBC7ms'
)
