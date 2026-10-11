// Database connection. Leave both values empty to run from the bundled snapshot in data/snapshot.json.
// The key must be the Supabase publishable (anon) key. It is safe in a public page because the
// database only grants read access to it. Never put the service role key here.
window.TRACKER_CONFIG = {
  supabaseUrl: 'https://hnomtbmfxtyrmtoeuabr.supabase.co',
  supabaseKey: 'sb_publishable_GR7_GRTZ0YrOrVjASo3gCQ_ZiHE8BU8',
  tablePrefix: 'og_',
  // Optional. A Google Maps Embed key shows a Google satellite view inside each record card.
  // Restrict the key to this site's address in the Google Cloud console before adding it.
  googleMapsKey: 'AIzaSyBzprfOizPCuMqczlVc4j0qWrvalCTwiPM'
};
