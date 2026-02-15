import OBR from "@owlbear-rodeo/sdk";
import { createAuroraMenu } from "./createAuroraMenu";
//import { startEffectManager } from "./effectManager";

//let cleanup: (() => void) | null = null;

OBR.onReady(() => {
  createAuroraMenu();
//  cleanup = startEffectManager();
});

// Clean up on HMR refresh (development only)
// if (import.meta.hot) {
//  import.meta.hot.accept();
//  import.meta.hot.dispose(() => {
//    cleanup?.();
//  });
//}
