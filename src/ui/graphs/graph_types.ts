export interface Datasets {
  label: string
  data: (number | null)[]
  keys: number[]
  keyType: string
  backgroundColor?: string | string[]
  borderColor?: string | string[]
  borderDash?: number[]
  tension?: number
  tooltipData?: string[]
}

export interface GraphStructure {
  labels: string[]
  datasets: Datasets[]
}
