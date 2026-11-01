declare module '@justalk/anime-api' {
  const animeapi: {
    links: (search: string, options?: any) => Promise<any[]>;
    stream: (search: string, episode: number | string, options?: any) => Promise<any[]>;
    download: (search: string, episode: number | string, options?: any) => Promise<any[]>;
  };
  export default animeapi;
}
