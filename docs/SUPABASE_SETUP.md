# Supabase + Google OAuth setup

Step-by-step to wire Google sign-in for Meridian. Total time: ~10 minutes.

You'll need:
- A Google account (for Supabase login + Google Cloud)
- Browser tabs for [supabase.com](https://supabase.com), [console.cloud.google.com](https://console.cloud.google.com)

At the end you'll have three values to paste into `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET`

---

## 1. Create the Supabase project

1. Open <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Fill in:
   - **Name**: `meridian`
   - **Database Password**: generate one and stash it in a password manager (we won't need it for this milestone but you'll want it later for M2)
   - **Region**: closest to you (e.g. `West US (North California)`)
   - **Pricing Plan**: Free tier is fine
4. Click **Create new project**. Provisioning takes ~2 minutes.

While that's spinning up, do step 2.

---

## 2. Get a Google OAuth client

Supabase needs a Google OAuth client ID + secret to broker the sign-in.

1. Open <https://console.cloud.google.com/apis/credentials> (sign in with the same Google account if needed).
2. If you don't have a project yet: top-bar project dropdown → **New Project** → name it `meridian` → Create.
3. Once selected: in the left sidebar **OAuth consent screen** → **Configure consent screen**.
   - **User Type**: External → Create
   - **App name**: `Meridian`
   - **User support email**: your email
   - **Developer contact**: your email
   - Save → continue past the Scopes / Test Users / Summary screens (defaults are fine)
   - Back to dashboard
4. Left sidebar → **Credentials** → **+ Create credentials** → **OAuth client ID**.
   - **Application type**: Web application
   - **Name**: `Meridian web`
   - **Authorized JavaScript origins**: `http://localhost:5500`
   - **Authorized redirect URIs**: leave this empty for now — you'll fill in the Supabase callback URL after step 3.
   - Click **Create**.
5. A modal shows your **Client ID** and **Client Secret**. Keep this tab open; you'll paste them into Supabase next.

---

## 3. Wire Google as a provider in Supabase

By now your Supabase project should be ready.

1. In the Supabase dashboard, open your project → left sidebar **Authentication** → **Providers**.
2. Find **Google** in the list → click to expand → toggle **Enable** on.
3. **Callback URL (for OAuth)**: copy this value. It looks like
   `https://<random-id>.supabase.co/auth/v1/callback`.
4. Switch back to the Google Cloud OAuth client tab → click your `Meridian web` credential → in **Authorized redirect URIs** paste the Supabase callback URL → **Save**.
5. Back in Supabase → paste the **Client ID** and **Client Secret** from Google → **Save**.

---

## 4. Configure Site URL

Still in Supabase Authentication:

1. Sidebar **Authentication** → **URL Configuration**.
2. **Site URL**: `http://localhost:5500`
3. **Redirect URLs**: add these two (one per line):
   ```
   http://localhost:5500/**
   http://localhost:5500/?live=1
   ```
4. **Save changes**.

---

## 5. Copy the three env values

1. Sidebar **Project Settings** (gear icon) → **API**.
2. Under **Project URL**, copy the URL (looks like `https://abcd1234.supabase.co`). This is `SUPABASE_URL`.
3. Under **Project API keys**, copy the **`anon` `public`** key. This is `SUPABASE_ANON_KEY`.
4. Scroll down to **JWT Settings** → copy the **JWT Secret**. This is `SUPABASE_JWT_SECRET`.

---

## 6. Paste into `.env`

Open `/Users/aadi/Desktop/Meridian/code/MeridianCode/.env` and append:

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_JWT_SECRET=<the JWT secret>
```

Then run:

```bash
npm run doctor
```

It should show all four checks ✓ (the doctor script will get a Supabase block in the next code commit; for now it just verifies the file is parseable).

---

## What the code does

When a user clicks **Sign in with Google**:

1. Frontend (`@supabase/supabase-js`) redirects to Google.
2. Google redirects back to Supabase's callback URL.
3. Supabase redirects to `http://localhost:5500/?live=1` with a session in the URL fragment.
4. Frontend Supabase client picks up the session, gets the access_token.
5. Frontend POSTs `{ accessToken }` to `/api/auth/supabase-session` on our Node backend.
6. Backend verifies the JWT with `SUPABASE_JWT_SECRET`, extracts email + Supabase user_id.
7. Backend looks up a local user by that email (auto-link). If none, creates a new user with `supabaseUserId` set and no password hash.
8. Backend issues the existing `meridian_session` cookie. Subsequent requests use it as before.

Email/password sign-in continues to work for `demo@meridian.local` and any other accounts you've created with bcrypt passwords.
