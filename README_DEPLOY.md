# 🚀 The Golden Path Deployment Guide

I've evaluated all methods and this is the **most stable, free, and easiest way** to get your project live.

## Step 1: Push Code to GitHub
Since your terminal doesn't see `git`, the easiest way is using a windowed app:
1. **Download GitHub Desktop**: [desktop.github.com](https://desktop.github.com/).
2. **Add Local Repository**: Point it to your `attendance` folder.
3. **Publish to GitHub**: Click "Publish Repository" to create a PRIVATE or PUBLIC repo on your GitHub account.

---

## Step 2: Backend -> Render (Always stable with Docker)
Render will use the `Dockerfile` I created to handle your face recognition AI perfectly.
1. **Go to [Render.com](https://render.com/)** and sign in with GitHub.
2. Click **New +** > **Web Service**.
3. Connect your repository.
4. **Settings**:
   - Runtime: **Docker** (Render will auto-detect).
5. **Environment Variables**: Add these from your `server/.env`:
   - `DATABASE_URL`: (Your Neon DB link)
   - `JWT_SECRET`: (Any secure word)
   - `FRONTEND_URL`: (You will get this from Netlify in Step 3)
   - `CAMPUS_LAT`, `CAMPUS_LNG`, `MAX_DISTANCE_METERS`: (Copy from `.env`)
6. **Wait for Deploy**: It will give you a URL like `https://attendance-api.onrender.com`.

---

## Step 3: Frontend -> Netlify (Fast & Easy)
Netlify will host your website and talk to the Render backend.
1. **Go to [Netlify.com](https://app.netlify.com/)** and sign in with GitHub.
2. Click **Add new site** > **Import an existing project**.
3. Import your repo.
4. **Build Settings**:
   - Base directory: `client`
   - Build command: `npm run build`
   - Publish directory: `dist`
5. **Environment Variables**:
   - Add `VITE_API_URL`: Use your Render URL + `/api` (e.g., `https://attendance-api.onrender.com/api`).
6. **Deploy**!

---

## Final Step: Loop the URLs
1. Copy your new **Netlify URL** (e.g., `https://your-site.netlify.app`).
2. Go back to your **Render** settings and update the `FRONTEND_URL` variable to match it.

**You're live!** 🎉
Check out your Netlify link to see your project on the internet.
unlink(file:///c:/Users/LENOVO/OneDrive/Desktop/attendance/README_DEPLOY.md)
