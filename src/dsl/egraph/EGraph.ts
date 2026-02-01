/**
 * E-Graph: Equality Graph for expression optimization
 *
 * An e-graph efficiently represents equivalence classes of expressions.
 * It supports:
 * - Adding expressions (returns e-class ID)
 * - Merging e-classes (union)
 * - Finding canonical e-class (find)
 * - Rebuilding after merges (maintains congruence)
 */

import { ENode, EClassId, enodeKey, enodeChildren, enodeWithChildren } from './ENode.js';

/**
 * E-Class: An equivalence class of expressions
 */
export interface EClass {
  id: EClassId;
  nodes: Set<string>;  // Set of e-node keys in this class
  parents: Set<string>; // E-node keys that reference this class
}

/**
 * E-Graph: The main data structure
 */
export class EGraph {
  private nextId: EClassId = 0;
  private classes: Map<EClassId, EClass> = new Map();
  private parent: Map<EClassId, EClassId> = new Map();  // Union-find parent
  private rank: Map<EClassId, number> = new Map();       // Union-find rank
  private hashcons: Map<string, EClassId> = new Map();   // E-node key -> e-class
  private nodeStore: Map<string, ENode> = new Map();     // Key -> actual node
  private pending: EClassId[] = [];                       // Classes needing rebuild

  /**
   * Find the canonical e-class ID (with path compression)
   */
  find(id: EClassId): EClassId {
    let root = id;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = id;
    while (this.parent.get(current) !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  /**
   * Add an e-node to the e-graph, returning its e-class ID
   * If the node already exists, returns the existing class
   */
  add(node: ENode): EClassId {
    // Canonicalize children first
    const canonNode = this.canonicalize(node);
    const key = enodeKey(canonNode);

    // Check if already exists
    const existing = this.hashcons.get(key);
    if (existing !== undefined) {
      return this.find(existing);
    }

    // Create new e-class
    const id = this.nextId++;
    this.parent.set(id, id);
    this.rank.set(id, 0);

    const eclass: EClass = {
      id,
      nodes: new Set([key]),
      parents: new Set()
    };
    this.classes.set(id, eclass);
    this.hashcons.set(key, id);
    this.nodeStore.set(key, canonNode);

    // Register as parent of children
    for (const childId of enodeChildren(canonNode)) {
      const childClass = this.classes.get(this.find(childId));
      if (childClass) {
        childClass.parents.add(key);
      }
    }

    return id;
  }

  /**
   * Merge two e-classes, returning the new canonical ID
   */
  merge(id1: EClassId, id2: EClassId): EClassId {
    const root1 = this.find(id1);
    const root2 = this.find(id2);

    if (root1 === root2) {
      return root1;
    }

    // Union by rank
    const rank1 = this.rank.get(root1)!;
    const rank2 = this.rank.get(root2)!;

    let newRoot: EClassId;
    let oldRoot: EClassId;

    if (rank1 < rank2) {
      newRoot = root2;
      oldRoot = root1;
    } else if (rank1 > rank2) {
      newRoot = root1;
      oldRoot = root2;
    } else {
      newRoot = root1;
      oldRoot = root2;
      this.rank.set(newRoot, rank1 + 1);
    }

    this.parent.set(oldRoot, newRoot);

    // Merge e-class data
    const newClass = this.classes.get(newRoot)!;
    const oldClass = this.classes.get(oldRoot)!;

    for (const nodeKey of oldClass.nodes) {
      newClass.nodes.add(nodeKey);
    }
    for (const parentKey of oldClass.parents) {
      newClass.parents.add(parentKey);
    }

    // Mark for rebuild
    this.pending.push(newRoot);

    return newRoot;
  }

  /**
   * Rebuild the e-graph to restore congruence invariants
   * Must be called after a batch of merges
   */
  rebuild(): void {
    while (this.pending.length > 0) {
      const todo = [...this.pending];
      this.pending = [];

      for (const classId of todo) {
        this.repair(this.find(classId));
      }
    }
  }

  /**
   * Repair an e-class after merges
   */
  private repair(classId: EClassId): void {
    const eclass = this.classes.get(classId);
    if (!eclass) return;

    // Collect parent nodes that need re-canonicalization
    const oldParents = new Set(eclass.parents);
    eclass.parents.clear();

    for (const parentKey of oldParents) {
      const parentNode = this.nodeStore.get(parentKey);
      if (!parentNode) continue;

      // Remove old hashcons entry
      this.hashcons.delete(parentKey);

      // Re-canonicalize and re-add
      const canonNode = this.canonicalize(parentNode);
      const newKey = enodeKey(canonNode);

      const existingClass = this.hashcons.get(newKey);
      if (existingClass !== undefined) {
        // Node already exists in another class - merge
        const parentClassId = this.findClassForNode(parentKey);
        if (parentClassId !== undefined) {
          this.merge(parentClassId, existingClass);
        }
      } else {
        // Update hashcons with new key
        const parentClassId = this.findClassForNode(parentKey);
        if (parentClassId !== undefined) {
          this.hashcons.set(newKey, parentClassId);
          this.nodeStore.set(newKey, canonNode);

          const parentClass = this.classes.get(this.find(parentClassId));
          if (parentClass) {
            parentClass.nodes.delete(parentKey);
            parentClass.nodes.add(newKey);
          }
        }
      }
    }

    // Re-register parents for this class
    for (const nodeKey of eclass.nodes) {
      const node = this.nodeStore.get(nodeKey);
      if (!node) continue;

      for (const childId of enodeChildren(node)) {
        const childClass = this.classes.get(this.find(childId));
        if (childClass) {
          childClass.parents.add(nodeKey);
        }
      }
    }
  }

  /**
   * Find which e-class contains a node (by key)
   */
  private findClassForNode(nodeKey: string): EClassId | undefined {
    for (const [id, eclass] of this.classes) {
      if (eclass.nodes.has(nodeKey)) {
        return this.find(id);
      }
    }
    return undefined;
  }

  /**
   * Canonicalize an e-node (update children to canonical IDs)
   */
  private canonicalize(node: ENode): ENode {
    const children = enodeChildren(node);
    if (children.length === 0) {
      return node;
    }
    const canonChildren = children.map(id => this.find(id));
    return enodeWithChildren(node, canonChildren);
  }

  /**
   * Get all e-class IDs
   */
  getClassIds(): EClassId[] {
    const canonical = new Set<EClassId>();
    for (const id of this.classes.keys()) {
      canonical.add(this.find(id));
    }
    return [...canonical];
  }

  /**
   * Get an e-class by ID
   */
  getClass(id: EClassId): EClass | undefined {
    return this.classes.get(this.find(id));
  }

  /**
   * Get all e-nodes in an e-class
   */
  getNodes(classId: EClassId): ENode[] {
    const eclass = this.classes.get(this.find(classId));
    if (!eclass) return [];

    const nodes: ENode[] = [];
    for (const key of eclass.nodes) {
      const node = this.nodeStore.get(key);
      if (node) {
        nodes.push(this.canonicalize(node));
      }
    }
    return nodes;
  }

  /**
   * Get the number of e-classes
   */
  get size(): number {
    return this.getClassIds().length;
  }

  /**
   * Get a node by its key
   */
  getNodeByKey(key: string): ENode | undefined {
    return this.nodeStore.get(key);
  }

  /**
   * Lookup e-class by node (if it exists)
   */
  lookup(node: ENode): EClassId | undefined {
    const canonNode = this.canonicalize(node);
    const key = enodeKey(canonNode);
    const id = this.hashcons.get(key);
    return id !== undefined ? this.find(id) : undefined;
  }

  /**
   * Debug: print e-graph state
   */
  dump(): string {
    const lines: string[] = ['E-Graph:'];
    for (const classId of this.getClassIds()) {
      const eclass = this.classes.get(classId);
      if (!eclass) continue;

      const nodeStrs = [...eclass.nodes].map(key => {
        const node = this.nodeStore.get(key);
        return node ? this.nodeToString(node) : key;
      });
      lines.push(`  [${classId}]: ${nodeStrs.join(' = ')}`);
    }
    return lines.join('\n');
  }

  /**
   * Convert e-node to readable string
   */
  private nodeToString(node: ENode): string {
    switch (node.tag) {
      case 'num': return `${node.value}`;
      case 'var': return node.name;
      case 'add': return `(+ e${node.children[0]} e${node.children[1]})`;
      case 'mul': return `(* e${node.children[0]} e${node.children[1]})`;
      case 'sub': return `(- e${node.children[0]} e${node.children[1]})`;
      case 'div': return `(/ e${node.children[0]} e${node.children[1]})`;
      case 'pow': return `(^ e${node.children[0]} e${node.children[1]})`;
      case 'neg': return `(neg e${node.child})`;
      case 'inv': return `(inv e${node.child})`;
      case 'call': return `(${node.name} ${node.children.map(c => `e${c}`).join(' ')})`;
      case 'component': return `(. e${node.object} ${node.field})`;
    }
  }
}
