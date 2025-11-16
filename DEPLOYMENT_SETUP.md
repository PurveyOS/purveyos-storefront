# GitHub Repository Setup Commands

After creating the GitHub repository at https://github.com/ccross41585-cmd/purveyos-storefront, run these commands:

```bash
git remote add origin https://github.com/ccross41585-cmd/purveyos-storefront.git
git push -u origin main
```

## Next Steps After GitHub Setup:

1. **Deploy to Cloudflare Pages**:
   - Connect the new GitHub repo
   - Build command: `npm run build`
   - Output directory: `dist`

2. **Add Environment Variables** in Cloudflare Pages:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Configure DNS** for `purveyos.store`:
   ```
   Type: CNAME
   Name: *
   Target: your-pages-domain.pages.dev
   Proxy: Proxied
   ```

4. **Test** with `sweetppastures.purveyos.store`

The storefront will then be live and accessible via subdomains!