export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

export interface FigmaFrameInfo {
  id: string
  name: string
  type: string
}

export interface FigmaFileInfo {
  name: string
  lastModified: string
  pages: FigmaNode[]
  frames: FigmaFrameInfo[]
}

export interface FigmaRenderedFrame {
  nodeId: string
  nodeName: string
  imageUrl: string
}

export interface FigmaDownloadedImage {
  nodeId: string
  nodeName: string
  imagePath: string
  imageBase64: string
}

export interface FigmaGherkinResult {
  nodeId: string
  nodeName: string
  gherkinFile: string
  imagePath: string
  gherkinContent: string
}
