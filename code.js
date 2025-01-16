figma.showUI(__html__, { width: 400, height: 500 });

async function findBrokenInstances(node, brokenInstances) {
    console.log(`Analyse du nœud : ${node.name} (${node.type})`);

    if (node.type === 'INSTANCE') {
        let isBroken = false;

        try {
            const mainComponent = await node.getMainComponentAsync();
            console.log(`MainComponent pour ${node.name}:`, mainComponent);

            // Vérifications strictes pour les instances cassées
            if (!mainComponent || mainComponent.parent === null) {
                isBroken = true;
            }
        } catch (error) {
            console.error(`Erreur avec ${node.name} :`, error.message);
            isBroken = true; // Si une erreur survient, on considère que l'instance est cassée
        }

        if (isBroken) {
            console.log(`Instance cassée détectée : ${node.name} (ID : ${node.id})`);
            brokenInstances.push({
            name: node.name || '(Instance sans nom)',
            id: node.id,
        });
    }
}

  // Parcourt les enfants récursivement si le nœud a des enfants
  if ('children' in node) {
    for (const child of node.children) {
      await findBrokenInstances(child, brokenInstances);
    }
  }
}

async function scanHierarchy(startNode) {
  const brokenInstances = [];
  console.log(`Démarrage du scan pour : ${startNode.name}`);
  await findBrokenInstances(startNode, brokenInstances);
  console.log(`Scan terminé. Nombre d'instances cassées trouvées : ${brokenInstances.length}`);
  return brokenInstances;
}

async function runScan() {
  const selection = figma.currentPage.selection;
  const isSelectionEmpty = selection.length === 0;

  const startNode = isSelectionEmpty ? figma.currentPage : selection[0];
  const scanScope = isSelectionEmpty ? 'page' : 'selection';

  const brokenInstances = await scanHierarchy(startNode);

  figma.ui.postMessage({
    type: 'scanComplete',
    scope: scanScope,
    instances: brokenInstances,
  });

  if (brokenInstances.length === 0) {
    figma.notify('Aucune instance cassée trouvée.');
  } else {
    figma.notify(`${brokenInstances.length} instance(s) cassée(s) trouvée(s).`);
  }
}

function updateScanScope() {
  const selection = figma.currentPage.selection;
  const isSelectionEmpty = selection.length === 0;
  const scanScope = isSelectionEmpty ? 'page' : 'selection';
  figma.ui.postMessage({ type: 'updateScope', scope: scanScope });
  console.log(`Mise à jour du scope : ${scanScope}`);
}

// Gestion des messages venant de l'UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'runScan') {
    console.log('Scan relancé via l\'interface utilisateur.');
    await runScan();
  } else if (msg.type === 'focusOnInstance') {
    const nodeId = msg.nodeId;
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node) {
        // Sélectionne l'élément et déplace la vue dessus
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
        figma.notify(`Instance sélectionnée : ${node.name}`);
      } else {
        figma.notify('Impossible de trouver cette instance.');
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du nœud :', error);
      figma.notify('Erreur lors de la tentative de sélection de l\'instance.');
    }
  }
};

figma.on('selectionchange', updateScanScope);

runScan();
