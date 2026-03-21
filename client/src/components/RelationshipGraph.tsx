// client/src/components/RelationshipGraph.tsx
import { useRef, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Relationship, Character } from '../api/api'

interface RelationshipGraphProps {
  characters: Character[]
  relationships: Relationship[]
}

interface GraphNode {
  id: string
  name: string
  val: number
  color: string
}

interface GraphLink {
  source: string
  target: string
  label: string
  color: string
}

const typeColors: Record<string, string> = {
  ally: '#22c55e',
  rival: '#ef4444',
  romantic: '#ec4899',
  mentor: '#3b82f6',
  family: '#a855f7',
  friend: '#14b8a6',
  enemy: '#7f1d1d',
  neutral: '#6b7280',
}

export default function RelationshipGraph({ characters, relationships }: RelationshipGraphProps) {
  const fgRef = useRef<any>()

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = characters.map(char => ({
      id: char.id,
      name: char.name,
      val: 10,
      color: '#3b82f6',
    }))

    const links: GraphLink[] = relationships.map(rel => ({
      source: rel.fromCharId,
      target: rel.toCharId,
      label: rel.type,
      color: typeColors[rel.type] || typeColors.neutral,
    }))

    return { nodes, links }
  }, [characters, relationships])

  if (characters.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <p className="text-gray-500">Add characters to see the relationship graph</p>
      </div>
    )
  }

  if (relationships.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <p className="text-gray-500">Add relationships between characters to visualize them</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">Relationship Graph</h3>
        <div className="flex gap-2 text-xs">
          {Object.entries(typeColors).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize text-gray-600">{type}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: '500px' }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={() => '#3b82f6'}
          nodeRelSize={6}
          linkColor={(link: any) => link.color}
          linkWidth={2}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkLabel={(link: any) => link.label}
          linkCurvature={0.25}
          onNodeClick={(node: any) => {
            fgRef.current?.centerOn(node)
          }}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
        />
      </div>
    </div>
  )
}
