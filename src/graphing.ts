import {
  LineGraphOptions,
  ProcessedStats,
  StackedAreaGraphOptions
} from './interfaces'

// GitHub renders mermaid with a fixed maxTextSize; long jobs produce more
// samples than fit and the chart fails with "Maximum text size in diagram
// exceeded". Downsample to a fixed point budget with bucket means so any
// job length renders, keeping full-timeline coverage.
const MAX_GRAPH_POINTS = 100

function downsamplePoints(
  points: ProcessedStats[],
  maxPoints: number = MAX_GRAPH_POINTS
): ProcessedStats[] {
  if (points.length <= maxPoints) {
    return points
  }
  const bucketSize = points.length / maxPoints
  const result: ProcessedStats[] = []
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize))
    const bucket = points.slice(start, end)
    const x = bucket[Math.floor(bucket.length / 2)].x
    const y = bucket.reduce((sum, p) => sum + p.y, 0) / bucket.length
    result.push({ x, y: Math.round(y * 100) / 100 })
  }
  return result
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

function formatPlaceHolderImage(label: string, color: string): string {
  const hexColor = color.substring(0, 7).replace('#', '')
  const size = 14
  return `![${label}](https://placehold.co/${size}x${size}/${hexColor}/${hexColor})`
}

export async function getLineGraph(options: LineGraphOptions): Promise<string> {
  const payload = {
    options: {
      width: 1200,
      height: 350,
      xAxis: {
        label: 'Time'
      },
      yAxis: {
        label: options.label
      },
      timeTicks: {
        unit: 'auto'
      }
    },

    lines: [options.line]
  }

  const line = {
    ...payload.lines[0],
    points: downsamplePoints(payload.lines[0].points)
  }

  const chartContent = `\`\`\`mermaid
---
config:
  xyChart:
    width: ${payload.options.width}
    height: ${payload.options.height}
    xAxis:
      labelFontSize: 10
      showLabel: false
      showTick: true
  themeVariables:
    xyChart:
      plotColorPalette: '${line.color}'
---
xychart
  x-axis "${payload.options.xAxis.label}" [${line.points
    .map(point => formatTime(new Date(point.x)))
    .map(time => `"${time}"`)
    .join(', ')}]
  y-axis "${payload.options.yAxis.label}"
  line [${line.points.map(point => point.y).join(', ')}]
\`\`\``

  return chartContent.trim()
}

export async function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): Promise<string> {
  const payload = {
    options: {
      width: 1200,
      height: 350,
      xAxis: {
        label: 'Time'
      },
      yAxis: {
        label: options.label
      },
      timeTicks: {
        unit: 'auto'
      }
    },
    areas: options.areas.map(area => ({
      ...area,
      points: downsamplePoints(area.points)
    }))
  }

  const firstArea = payload.areas[0] // Assuming all areas have the same x values

  const stackedBars: number[][] = []

  for (const a of payload.areas) {
    // construct stacked bars by summing y values of current area and all previous areas
    const lastStackedBar =
      stackedBars.length > 0
        ? stackedBars[stackedBars.length - 1]
        : (new Array(a.points.length).fill(0) as number[])
    const currentStackedBar = a.points.map(
      (point, index) => point.y + lastStackedBar[index]
    )
    stackedBars.push(currentStackedBar)
  }

  const chartContent = `\`\`\`mermaid
---
config:
  xyChart:
    width: ${payload.options.width}
    height: ${payload.options.height}
    xAxis:
      labelFontSize: 10
      showLabel: false
      showTick: true
  themeVariables:
    xyChart:
      plotColorPalette: '${[...payload.areas]
        .reverse()
        .flatMap((area, i) => [
          area.color,
          `${area.color.substring(0, 7)}${((50 / payload.areas.length) * (i + 1) + 10 * (i + 1)).toFixed(0)}`
        ])
        .join(', ')}'
---
xychart
  x-axis "${payload.options.xAxis.label}" [${firstArea.points
    .map(point => formatTime(new Date(point.x)))
    .map(time => `"${time}"`)
    .join(', ')}]
  y-axis "${payload.options.yAxis.label}"
  ${[...stackedBars]
    .reverse()
    .flatMap(bar => [`line [${bar.join(', ')}]`, `bar [${bar.join(', ')}]`])
    .join('\n  ')}
\`\`\`
${payload.areas.map(area => `${formatPlaceHolderImage(area.label, area.color)} **${area.label}**`).join('\n')}
`

  return chartContent.trim()
}
