figma.showUI(__html__, { width: 400, height: 500 });

async function findBrokenInstances(node, brokenInstances) {
    console.log(`Analyse du nœud : ${node.name} (${node.type})`);

    if (node.type === 'INSTANCE') {
        let isBroken = false;
        let brokenReason = '';
        let detectionMethod = '';
        let componentParentId = null;

        try {
            const mainComponent = await node.getMainComponentAsync();
            console.log(`[METHODE 1] MainComponent pour ${node.name}:`, mainComponent);
            
            if (!mainComponent) {
                console.log(`[METHODE 1] Instance cassée détectée: ${node.name} - mainComponent est null`);
                isBroken = true;
                brokenReason = 'Le composant principal a été supprimé';
                detectionMethod = 'METHODE 1: getMainComponentAsync() retourne null';
            } else {
                console.log(`[METHODE 1] MainComponent trouvé pour ${node.name}, vérification de validité...`);
                
                console.log(`[ANALYSE] Propriétés du composant principal pour ${node.name}:`);
                printObjectRecursively(mainComponent, 'mainComponent');

                try {
                    const componentName = mainComponent.name;
                    const componentId = mainComponent.id;
                    const componentParent = mainComponent.parent;
                    
                    componentParentId = componentParent ? componentParent.id : null;
                    
                    console.log(`[METHODE 1] Détails du composant: name='${componentName}', id='${componentId}', parent=${componentParent}`);
                    
                    if (componentParent === null) {
                        console.log(`[METHODE 2] Instance cassée détectée: ${node.name} - parent du composant est null`);
                        isBroken = true;
                        brokenReason = 'Le composant principal existe mais son parent a été supprimé';
                        detectionMethod = 'METHODE 2: mainComponent.parent === null';
                    } else {
                        try {
                            const parentExists = await figma.getNodeByIdAsync(componentParent.id);
                            if (!parentExists) {
                                console.log(`[METHODE 3] Instance cassée détectée: ${node.name} - parent du composant n'existe pas dans le document`);
                                isBroken = true;
                                brokenReason = 'Le parent du composant principal n\'existe pas dans le document';
                                detectionMethod = 'METHODE 3: Parent du composant principal inexistant';
                            } else {
                                let targetPage = null;
                                if (componentParent.type === 'PAGE') {
                                  targetPage = componentParent;
                                } else {
                                  let current = componentParent;
                                  while (current && current.type !== 'PAGE') {
                                    current = current.parent;
                                  }
                                  targetPage = current;
                                }
                                if (!targetPage) {
                                  console.log(`[METHODE 4] Instance cassée détectée: ${node.name} - impossible de déterminer la page du parent`);
                                  isBroken = true;
                                  brokenReason = 'Impossible de déterminer la page du composant principal';
                                  detectionMethod = 'METHODE 4: Impossible de déterminer la page du parent';
                                } else {
                                  console.log(`[VALIDATION] Instance ${node.name} est VALIDE - toutes les vérifications passées`);
                                  brokenReason = 'Instance valide';
                                  detectionMethod = 'VALIDATION: Toutes les vérifications passées';
                                }
                            }
                        } catch (parentError) {
                            console.log(`[METHODE 3] Erreur lors de la vérification de l'existence du parent pour ${node.name}:`, parentError.message);
                            isBroken = true;
                            brokenReason = 'Erreur lors de la vérification de l\'existence du parent du composant principal';
                            detectionMethod = 'METHODE 3: Erreur lors de la vérification de l\'existence du parent';
                        }
                    }
                } catch (propError) {
                    console.log(`[METHODE 2] Erreur d'accès aux propriétés pour ${node.name}:`, propError.message);
                    isBroken = true;
                    brokenReason = 'Impossible d\'accéder aux propriétés du composant principal';
                    detectionMethod = 'METHODE 2: Erreur lors de l\'accès aux propriétés du composant';
                }
            }
                        
        } catch (mainError) {
            console.log(`[METHODE 1] Erreur lors de getMainComponentAsync pour ${node.name}:`, mainError.message);
            isBroken = true;
            brokenReason = `Erreur critique lors de l'accès au composant: ${mainError.message}`;
            detectionMethod = 'METHODE 1: Exception lors de getMainComponentAsync()';
        }

        brokenInstances.push({
            name: node.name || '(Instance sans nom)',
            id: node.id,
            reason: brokenReason,
            method: detectionMethod,
            isBroken: isBroken,
            parentId: componentParentId
        });
    }

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
  console.log(`Scan terminé. Nombre d'instances analysées : ${brokenInstances.length}`);
  return brokenInstances;
}

async function runScan() {
  const selection = figma.currentPage.selection;
  const isSelectionEmpty = selection.length === 0;

  const startNode = isSelectionEmpty ? figma.currentPage : selection[0];
  const scanScope = isSelectionEmpty ? 'page' : 'selection';

  const instances = await scanHierarchy(startNode);

  figma.ui.postMessage({
    type: 'scanComplete',
    scope: scanScope,
    instances: instances,
  });

  if (instances.length === 0) {
    figma.notify('Aucune instance trouvée.');
  } else {
    figma.notify(`${instances.length} instance(s) trouvée(s).`);
  }
}

function updateScanScope() {
  const selection = figma.currentPage.selection;
  const isSelectionEmpty = selection.length === 0;
  const scanScope = isSelectionEmpty ? 'page' : 'selection';
  figma.ui.postMessage({ type: 'updateScope', scope: scanScope });
  console.log(`Mise à jour du scope : ${scanScope}`);
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'runScan') {
    console.log('Scan relancé via l\'interface utilisateur.');
    await runScan();
  } else if (msg.type === 'focusOnInstance') {
    const nodeId = msg.nodeId;
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node) {
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
  } else if (msg.type === 'focusOnParent') {
    const parentId = msg.parentId;
    try {
      const parentNode = await figma.getNodeByIdAsync(parentId);
      if (parentNode) {
        const currentPage = figma.currentPage;

        let targetPage = null;
        if (parentNode.type === 'PAGE') {
          targetPage = parentNode;
        } else {
          let current = parentNode;
          while (current && current.type !== 'PAGE') {
            current = current.parent;
          }
          targetPage = current;
        }
        
        if (targetPage && targetPage !== currentPage) {
          try {
            await figma.setCurrentPageAsync(targetPage);
            console.log(`Navigation vers la page : ${targetPage.name}`);
            
            const parentNodeAfterPageChange = await figma.getNodeByIdAsync(parentId);
            if (parentNodeAfterPageChange) {
              figma.currentPage.selection = [parentNodeAfterPageChange];
              figma.viewport.scrollAndZoomIntoView([parentNodeAfterPageChange]);
              figma.notify(`Composant parent sélectionné : ${parentNodeAfterPageChange.name} (page: ${targetPage.name})`);
            } else {
              figma.notify(`Parent introuvable après navigation vers la page "${targetPage.name}".`);
            }
          } catch (pageChangeError) {
            console.error('Erreur lors du changement de page:', pageChangeError);
            figma.notify(`Impossible de naviguer vers la page "${targetPage.name}": ${pageChangeError.message}`);
          }
        } else if (targetPage) {
          try {
            figma.currentPage.selection = [parentNode];
            figma.viewport.scrollAndZoomIntoView([parentNode]);
            figma.notify(`Composant parent sélectionné : ${parentNode.name}`);
          } catch (selectionError) {
            console.error('Erreur lors de la sélection:', selectionError);
            figma.notify(`Parent trouvé mais impossible de le sélectionner: ${selectionError.message}`);
          }
        } else {
          figma.notify('Impossible de déterminer sur quelle page se trouve le composant parent.');
        }
      } else {
        figma.notify('Le composant parent n\'existe plus dans le document.');
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du composant parent :', error);
      figma.notify('Erreur lors de la tentative de sélection du composant parent.');
    }
  }
};

figma.on('selectionchange', updateScanScope);

runScan();
