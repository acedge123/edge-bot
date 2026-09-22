# AI-dev production gotchas (repo review lens)

Use this as a quick “production reality check” when a repo was built fast (especially with AI assistance). These aren’t all strictly security issues, but they correlate strongly with outages, abuse, and breach risk.

1. **“It works perfectly in development”**
   - >90% of AI-generated bugs only show up under real traffic conditions.

2. **No one asked about your database size**
   - A query that runs in 0.2s on 500 rows can take 45s on 500,000.

3. **No testing for third‑party API outages**
   - The whole app often crashes instead of failing gracefully.

4. **No loading states in the UI**
   - Users click the button 6 times because nothing happened visually.

5. **Auth flow shipped in one shot without review**
   - Authentication is the single highest-risk part of most applications.

6. **File uploads have no size limits**
   - One 2GB upload can exhaust memory/disk and take the service down.

7. **No staging environment**
   - You’re testing in production and you don’t even know it.

8. **`setTimeout` used to “fix” a timing issue**
   - Not a fix; it’s a bomb with a delay.

9. **No abuse detection**
   - Bots will find your signup form before real users do.

10. **Overly technical error messages**
   - e.g., “PostgreSQL connection refused at port 5432” is a gift to attackers.

11. **Unmaintained dependency choice**
   - Libraries not updated in 2 years are often abandoned and become attack vectors.

12. **No caching layer**
   - Every page load hits the database directly, every single time.

13. **Mobile experience never tested**
   - AI codes for desktop by default; most users are on phones.

14. **No user feedback mechanism**
   - The app is breaking for people right now and you have no way of knowing.

15. **Shipped without any security audit**
   - Not even basic linting/static checks.
