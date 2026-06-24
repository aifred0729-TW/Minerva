import re

with open('/opt/Minerva/src/Minerva/pages/Dashboard.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    'className={perspective === \\'custom\\' && editing ? "cursor-move" : ""}',
    'className={cn("w-full h-full", perspective === \\'custom\\' && editing ? "cursor-move" : "")}'
)

text = text.replace(
    """<div onClick={() => navigate('/operations')} style={{ cursor: 'pointer' }}>
                    <OperationBriefingCard""",
    """<div onClick={() => navigate('/operations')} className="cursor-pointer h-full">
                    <OperationBriefingCard"""
)

text = text.replace(
    """<div onClick={() => navigate('/payloads')} style={{ cursor: 'pointer' }}>
                    <RecentPayloadsCard""",
    """<div onClick={() => navigate('/payloads')} className="cursor-pointer h-full">
                    <RecentPayloadsCard"""
)

# KpiStrip is just a grid, but let's make sure it's h-full
text = text.replace(
    """case 'terminalLog': return (
                <div className="border border-ghost/40 bg-black p-5 font-mono text-sm min-h-[220px] text-gray-100 relative overflow-hidden leading-relaxed">""",
    """case 'terminalLog': return (
                <div className="border border-ghost/40 bg-black p-5 font-mono text-sm min-h-[220px] text-gray-100 relative overflow-hidden leading-relaxed h-full">"""
)


with open('/opt/Minerva/src/Minerva/pages/Dashboard.tsx', 'w') as f:
    f.write(text)

