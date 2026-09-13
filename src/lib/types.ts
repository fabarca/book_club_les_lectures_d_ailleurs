export interface Book {
  title: string;
  author: string;
  edition: string;
  eventDate: string;
  year: string;
  country: string;
  description: string;
  imagePath: string;
  sourceFile: string;
}

export interface ManifestEntry {
  file: string;
  meetupEventId: string;
  editionNumber: number;
}
