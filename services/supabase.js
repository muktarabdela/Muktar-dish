// services/supabase.js

const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseAnonKey } = require('../config');

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;