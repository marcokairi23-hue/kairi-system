declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Uint8Array
    paragraphs: { start: number; end: number; level: number }[]
  }

  interface Bidi {
    getEmbeddingLevels(text: string, direction?: 'ltr' | 'rtl'): EmbeddingLevels
    getReorderSegments(text: string, embeddingLevels: EmbeddingLevels, start?: number, end?: number): [number, number][]
    getMirroredCharactersMap(text: string, embeddingLevels: EmbeddingLevels, start?: number, end?: number): Map<number, string>
    getMirroredCharacter(char: string): string | null
    getBidiCharTypeName(char: string): string
  }

  export default function bidiFactory(): Bidi
}
