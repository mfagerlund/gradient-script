/**
 * E-Node: Expression nodes in an e-graph
 *
 * E-nodes are hash-consed (deduplicated) and reference e-classes by ID.
 * This allows the e-graph to represent equivalence classes efficiently.
 */

export type EClassId = number;

/**
 * E-node variants representing different expression types
 */
export type ENode =
  | { tag: 'num'; value: number }
  | { tag: 'var'; name: string }
  | { tag: 'add'; children: [EClassId, EClassId] }
  | { tag: 'mul'; children: [EClassId, EClassId] }
  | { tag: 'sub'; children: [EClassId, EClassId] }
  | { tag: 'div'; children: [EClassId, EClassId] }
  | { tag: 'pow'; children: [EClassId, EClassId] }
  | { tag: 'neg'; child: EClassId }
  | { tag: 'inv'; child: EClassId }  // Reciprocal: inv(x) = 1/x
  | { tag: 'call'; name: string; children: EClassId[] }
  | { tag: 'component'; object: EClassId; field: string };

/**
 * Create a canonical string key for an e-node (for hash-consing)
 * This key is used to detect structurally identical nodes.
 */
export function enodeKey(node: ENode): string {
  switch (node.tag) {
    case 'num':
      return `num:${node.value}`;
    case 'var':
      return `var:${node.name}`;
    case 'add':
      return `add:${node.children[0]},${node.children[1]}`;
    case 'mul':
      return `mul:${node.children[0]},${node.children[1]}`;
    case 'sub':
      return `sub:${node.children[0]},${node.children[1]}`;
    case 'div':
      return `div:${node.children[0]},${node.children[1]}`;
    case 'pow':
      return `pow:${node.children[0]},${node.children[1]}`;
    case 'neg':
      return `neg:${node.child}`;
    case 'inv':
      return `inv:${node.child}`;
    case 'call':
      return `call:${node.name}(${node.children.join(',')})`;
    case 'component':
      return `comp:${node.object}.${node.field}`;
  }
}

/**
 * Get all e-class IDs that this node references (its children)
 */
export function enodeChildren(node: ENode): EClassId[] {
  switch (node.tag) {
    case 'num':
    case 'var':
      return [];
    case 'add':
    case 'mul':
    case 'sub':
    case 'div':
    case 'pow':
      return [...node.children];
    case 'neg':
      return [node.child];
    case 'inv':
      return [node.child];
    case 'call':
      return [...node.children];
    case 'component':
      return [node.object];
  }
}

/**
 * Create a new e-node with updated children (after canonicalization)
 */
export function enodeWithChildren(node: ENode, newChildren: EClassId[]): ENode {
  switch (node.tag) {
    case 'num':
    case 'var':
      return node;
    case 'add':
      return { tag: 'add', children: [newChildren[0], newChildren[1]] };
    case 'mul':
      return { tag: 'mul', children: [newChildren[0], newChildren[1]] };
    case 'sub':
      return { tag: 'sub', children: [newChildren[0], newChildren[1]] };
    case 'div':
      return { tag: 'div', children: [newChildren[0], newChildren[1]] };
    case 'pow':
      return { tag: 'pow', children: [newChildren[0], newChildren[1]] };
    case 'neg':
      return { tag: 'neg', child: newChildren[0] };
    case 'inv':
      return { tag: 'inv', child: newChildren[0] };
    case 'call':
      return { tag: 'call', name: node.name, children: newChildren };
    case 'component':
      return { tag: 'component', object: newChildren[0], field: node.field };
  }
}

/**
 * Check if two e-nodes are structurally equal
 */
export function enodesEqual(a: ENode, b: ENode): boolean {
  return enodeKey(a) === enodeKey(b);
}
