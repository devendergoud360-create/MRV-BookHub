import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float, Stars, Text, MeshDistortMaterial, RoundedBox, Environment } from '@react-three/drei'
import * as THREE from 'three'

function FloatingBook({ position, color = '#5b8cff', scale = 1, speed = 1 }) {
  const ref = useRef()
  useFrame((state) => {
    const t = state.clock.getElapsedTime() * speed
    if (!ref.current) return
    ref.current.rotation.x = Math.sin(t / 2) * 0.2 + 0.2
    ref.current.rotation.y += 0.005 * speed
    ref.current.position.y = position[1] + Math.sin(t) * 0.15
  })
  return (
    <group ref={ref} position={position} scale={scale}>
      <RoundedBox args={[1.2, 1.6, 0.22]} radius={0.05} smoothness={4}>
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} />
      </RoundedBox>
      <RoundedBox args={[1.05, 1.45, 0.24]} radius={0.03} smoothness={4} position={[0.02, 0, 0]}>
        <meshStandardMaterial color="#f4f1e8" roughness={0.9} />
      </RoundedBox>
    </group>
  )
}

function Orb({ position, color }) {
  return (
    <Float speed={2} rotationIntensity={1.2} floatIntensity={1.5}>
      <mesh position={position}>
        <icosahedronGeometry args={[0.7, 1]} />
        <MeshDistortMaterial color={color} speed={2} distort={0.35} roughness={0.1} metalness={0.6} />
      </mesh>
    </Float>
  )
}

export default function Scene() {
  const ring = useRef()
  useFrame((state) => {
    if (ring.current) {
      ring.current.rotation.z = state.clock.getElapsedTime() * 0.08
      ring.current.rotation.x = 1.1
    }
  })

  const particles = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    pos: [(Math.random() - 0.5) * 18, (Math.random() - 0.5) * 30 - 10, (Math.random() - 0.5) * 10 - 2],
    s: Math.random() * 0.06 + 0.02,
  })), [])

  return (
    <>
      <color attach="background" args={['#05070d']} />
      <fog attach="fog" args={['#05070d', 8, 35]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 6, 5]} intensity={1.4} color="#9ecbff" />
      <pointLight position={[-6, 2, 2]} intensity={18} color="#6a5cff" />
      <pointLight position={[6, -8, 4]} intensity={12} color="#00d4ff" />
      <Stars radius={60} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />

      <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.8}>
        <Text position={[0, 1.8, 0]} fontSize={0.7} color="#ffffff" anchorX="center" anchorY="middle" outlineWidth={0.01} outlineColor="#2a4cff">
          MRV BookHub
        </Text>
        <Text position={[0, 0.95, 0]} fontSize={0.22} color="#9fb4ff" anchorX="center" anchorY="middle" maxWidth={8}>
          3D Scrollable College Library & Book Exchange
        </Text>
      </Float>

      <FloatingBook position={[-3.2, 0.2, -1]} color="#5b8cff" scale={0.9} speed={1} />
      <FloatingBook position={[3.4, -0.4, -1.5]} color="#8b5cf6" scale={0.8} speed={0.8} />
      <FloatingBook position={[-1.8, -2.8, 0.5]} color="#14b8a6" scale={0.7} speed={1.2} />
      <FloatingBook position={[2.2, -6.5, -1]} color="#f59e0b" scale={0.85} speed={0.9} />
      <FloatingBook position={[-2.8, -10.5, -0.5]} color="#ec4899" scale={0.75} speed={1.1} />
      <FloatingBook position={[2.6, -14.5, -1.2]} color="#22c55e" scale={0.8} speed={0.7} />

      <Orb position={[-4.5, -4, -3]} color="#4f46e5" />
      <Orb position={[4.8, -9, -2]} color="#06b6d4" />
      <Orb position={[-4, -15, -2.5]} color="#a855f7" />

      <group ref={ring} position={[0, -7, -4]}>
        <torusGeometry args={[5.5, 0.03, 16, 120]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.35} />
      </group>

      {particles.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <sphereGeometry args={[p.s, 8, 8]} />
          <meshBasicMaterial color={i % 2 ? '#60a5fa' : '#c084fc'} transparent opacity={0.5} />
        </mesh>
      ))}
      <Environment preset="city" />
    </>
  )
}
