"use strict";

import { PageControllerWeb } from "./PageControllerWeb.js";
export function collectDomInteractives(root) {
  return new PageControllerWeb(root).collectInteractives();
}
export function buildDomScreenSnapshot(root, screenName, availableScreens) {
  return new PageControllerWeb(root).buildScreenSnapshot(screenName, availableScreens);
}
export function findNearestScrollableContainer(element) {
  return PageControllerWeb.findNearestScrollableContainer(element);
}
