/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['nextjs-shared'],
  env: {
    POSTGRES_URL: process.env.POSTGRES_URL
  }
}

export default config
