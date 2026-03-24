# 🚀 Golden Path Deployment (Option 2: No Card Needed)

This guide takes you through deploying your Attendance Portal for **FREE** without needing a credit card.

## 1. Push Code to GitHub
1. Open **GitHub Desktop**.
2. Make sure all your changes are committed.
3. Click **Push origin** to sync your code to GitHub.

## 2. Deploy Backend (Render) - 100% Free
1. Go to [Render.com](https://render.com/) and log in with GitHub.
2. Click **New +** > **Web Service**.
3. Select your `attend` repository.
4. Settings:
   - **Name**: `attend-api`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** (No credit card required!)
5. **Environment Variables** (Add these):
   - `DATABASE_URL`: (Your Neon DB URL)
   - `JWT_SECRET`: (Anything random)
   - `FRONTEND_URL`: (We will get this from Netlify next)
   - `PORT`: `10000`
   - `COLLEGE_DOMAIN`: `@raghuenggcollege.in`
   - `CAMPUS_LAT`: `17.925615`
   - `CAMPUS_LNG`: `83.424361`
   - `MAX_DISTANCE_METERS`: `500` (Recommended for reliability)
   - `GOOGLE_CLIENT_ID`: (The Client ID you got from Google)

## 3. Deploy Frontend (Netlify) - 100% Free
1. Go to [Netlify.com](https://www.netlify.com/) and log in with GitHub.
2. Click **Add new site** > **Import an existing project**.
3. Select your `attend` repository.
4. Settings:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
5. **Environment Variables**:
   - `VITE_API_URL`: (Your Render API URL, e.g., `https://attend-api.onrender.com/api`)
6. Click **Deploy**.

## 4. Final Link
Once your Netlify site is live (e.g., `https://your-app.netlify.app`), go back to **Render** and update the `FRONTEND_URL` environment variable to match your Netlify URL.

---
**Congratulations! Your app is now live and secure.**
