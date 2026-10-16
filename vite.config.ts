import { defineConfig } from 'vite';
export default defineConfig({root:'web',build:{outDir:'../dist',emptyOutDir:true},server:{port:9073,strictPort:true,proxy:{'/api':'http://127.0.0.1:9072'}}});
