import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { OAuth2Config, OAuthUserConfig } from "@auth/core/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

// OIDC claims returned by https://api.vercel.com/login/oauth/userinfo
interface VercelProfile {
  sub: string;
  email: string;
  preferred_username: string;
  picture?: string;
}

function VercelProvider(
  options: OAuthUserConfig<VercelProfile>
) {
  return {
    id: "vercel",
    name: "Vercel",
    type: "oauth",
    authorization: {
      url: "https://vercel.com/oauth/authorize",
      params: { scope: "openid" },
    },
    issuer: "https://vercel.com",
    token: "https://api.vercel.com/login/oauth/token",
    userinfo: "https://api.vercel.com/login/oauth/userinfo",
    client: { token_endpoint_auth_method: "client_secret_post" },
    profile(profile: VercelProfile) {
      return {
        id: profile.sub,
        name: profile.preferred_username,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
    ...options,
  } as OAuth2Config<VercelProfile>;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      authorization: {
        params: { scope: "repo read:user user:email" },
      },
      allowDangerousEmailAccountLinking: true,
    }),
    VercelProvider({
      clientId: process.env.AUTH_VERCEL_ID!,
      clientSecret: process.env.AUTH_VERCEL_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id || !account) return;

      if (account.provider === "github" && account.access_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: account.providerAccountId,
            githubToken: encrypt(account.access_token),
          },
        });
      }

      if (account.provider === "vercel" && account.access_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            vercelToken: encrypt(account.access_token),
          },
        });
      }
    },
  },
});
