// Database connection. Leave both values empty to run from the bundled snapshot in data/snapshot.json.
// The key must be the Supabase publishable (anon) key. It is safe in a public page because the
// database only grants read access to it. Never put the service role key here.
window.TRACKER_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
  tablePrefix: ''
};
