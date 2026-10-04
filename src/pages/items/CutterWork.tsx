import WorkflowUI from './WorkflowUI'

// UI-only pass: use existing readable order data, never pending RPCs.
export default function CutterWork() { return <WorkflowUI initial="cutter" /> }
