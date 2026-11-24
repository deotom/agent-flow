import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import type { UserConfig } from 'vite'

interface BuildTarget {
  outDir: string
  entry: string
  name: string
  define: Record<string, string>
  externalAssets?: boolean
}

export function createBuildConfig(target: BuildTarget): UserConfig {
  const assetFileNames = (info: { names?: string[] }) => {
    if (info.names?.[0]?.endsWith('.css')) return 'index.css'
    return target.externalAssets ? '[name]-[hash][extname]' : '[name].[ext]'
  }
  const externalBuild = target.externalAssets
    ? {
        cssCodeSplit: false,
        assetsInlineLimit: (filePath: string) =>
          /\.(webp|png|jpe?g|avif)$/i.test(filePath) ? false : undefined,
        rollupOptions: {
          input: resolve(__dirname, target.entry),
          output: {
            format: 'iife' as const,
            name: target.name,
            entryFileNames: 'index.js',
            inlineDynamicImports: true,
            assetFileNames,
          },
        },
      }
    : {
        lib: {
          entry: resolve(__dirname, target.entry),
          formats: ['iife' as const],
          name: target.name,
          fileName: () => 'index',
          cssFileName: 'index',
        },
        rollupOptions: {
          output: {
            entryFileNames: 'index.js',
            assetFileNames,
          },
        },
      }

  return {
    ...(target.externalAssets ? { base: '/' } : {}),
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname),
      },
    },
    publicDir: false,
    build: {
      outDir: resolve(__dirname, target.outDir),
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      ...externalBuild,
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      ...target.define,
    },
  }
}
