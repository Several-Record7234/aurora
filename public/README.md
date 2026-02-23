# <img src="icon.png" width="40" height="40"> Aurora: Time-Of-Day Lighting for Owlbear Rodeo

**Aurora** lets you transform the mood of your maps with real-time 'colour grading' - right inside Owlbear Rodeo. Desaturate a forest glade into gloomy shadow, bathe a tavern in golden-hour warmth, or wash a battlefield in eerie moonlight. It's all done with a GPU shader that runs directly on your map, so there's no image editing, no re-uploading, and changes can be seen instantly.

Aurora gives you four intuitive controls:

- **Saturation**: boost or drain the colour intensity of your map
- **Lightness**: brighten a sun-drenched scene or darken a cave
- **Hue**: overlay a colour tint (red for a burning city, blue for an underwater temple…)
- **Opacity**: control how strong that tint is, from a subtle wash to a bold colour shift

Mix and match these parameters to create exactly the atmosphere you're after, then save your favourites as presets that persist across every Scene in the Room.

⚠️ *NB. Aurora applies to **every** layer of the canvas, so if you have notes or other objects that you don't want to be colour-shifted, you can either place them outside of the affected area, or you can use the Drawing tools and the Trim function to make a custom mask for Aurora - with 'holes' for your notes and other objects to poke through unaffected!*

---

## Getting Started

### 1. Install The Extension

Copy the Aurora manifest URL:

```
https://aurora-0nm6.onrender.com/manifest.json
```

Then head to your **Owlbear Rodeo Room** → **Extras** → **Extensions** → **+** (Add Custom Extension), paste the URL, and confirm.

> ![Screenshot placeholder: Adding the manifest URL in the Owlbear Rodeo extension manager]

### 2. Enable Aurora In Your Room

In the **Extensions Manager** popover, make sure Aurora is **toggled on** for this Room. You should see the <img src="icon.png" width="20" height="20"> Aurora icon appear in the top-left extension Action tray.

> ![Screenshot placeholder: Enabling Aurora in the room's extension list]

---

## Applying An Effect

### 3. Add Aurora To Any Map Item

Select and right-click any item on the **Map layer** and choose **Add Aurora** from the context menu. That's it — the shader is now attached and ready to configure!

> ![Screenshot placeholder: Right-clicking a map image and selecting "Add Aurora"]

**💡 Pro tip:** Want to affect multiple maps with a single effect? Draw a large rectangle on the **Drawing** layer, move it to the **Map** layer, then **Add Aurora** to that rectangle. The shader covers the full area of whatever item it's attached to, so one big shape can mood-change your entire Scene in one go.

### 4. Adjust The Settings

After adding Aurora, right-click the same item again and choose **Aurora Settings**. This opens the control panel where you can tweak all four **Saturation**, **Lightness**, **Hue**, and **Opacity** sliders and preview their changes, and those parameters are set for everyone soon as you release them.

> ![Screenshot placeholder: The Aurora Settings popover with sliders]

There are also controls here for gradient effects, with a **Feather** percentage slider that adjusts how much of the shape is covered in a smooth gradient of the effect, and an **Invert** button that flips the direction of the 

**💡 Pro tip:** Having a map item with a particular effect applied and then layering one or more smaller shaders (with the same effect) on top of it will allow you to have some cool gradient cut-outs, where the smaller shapes use the Feather parameter (and the Invert state if needed) to allow smooth transitions from 0%-effect areas to 100%-effect areas - these smaller items can then be attached to tokens so that they follow movement around the map.

Shaders also inherit a proxy of their parent item's current layer, ensuring that a shader applied to a Prop-layer item (like a bright lamp) will always render above *and override* a shader applied to a Map-layer item (like a desaturated Darkvision range).

> ![Screenshot placeholder: Example of a gradient fill 'cutout' on a larger map effect]

---

## Working With Presets

Presets are a huge time-saver, and a great starting point for your own adjustments. Aurora ships with **four built-in presets** to get you going:

| Preset | Vibe |
|--------|------|
| **Midnight** | Deep desaturation with a cool blue-purple wash - perfect for nighttime encounters |
| **Golden Hour** | Warm, slightly darkened tones with a golden tint - great for sunset scenes |
| **Pre-Dawn** | Dimmed with a pale blue overlay - that quiet moment before the sun rises |
| **Blood Moon** | Heavily desaturated and darkened with a red tint - ominous and foreboding |

These can be recalled and then overwritten with your own remixes of them, plus there are two empty slots ready for your own unique creations.

### 5. Load a Preset

In the **Aurora Settings** popover, use the **Load Preset…** dropdown to pick any saved preset. The sliders snap to those values instantly - it's a great way to audition different moods or use a preset as a starting point before fine-tuning.

> ![Screenshot placeholder: Selecting a preset from the dropdown]

### 6. Toggle The Effect On And Off

Use the **Enabled** toggle at the top of the Aurora Settings panel to flip the shader on and off without losing your slider positions. This is really handy for comparing the "before and after" (toggle it a few times and you'll immediately see how much atmosphere the effect adds) or for sudden and dramatic mood shifts as you switch the shader right before your players' eyes!

> ![Screenshot or short recording placeholder: Toggling the effect on and off to compare]

### 7. Save Your Own Presets

Happy with your settings? Hit **Save Current As…** to store them. You can:

- **Pick a slot**: Aurora will auto-select the first empty slot, but you can choose any of the six presets
- **Overwrite an existing preset**: just select an occupied slot and confirm
- **(Re)name it**: give your preset a memorable name (up to 16 characters)

Presets are compacted and stored in the **Room metadata**, so they're shared with every player in the Room and they persist across sessions and Scene changes. A map-layer object that has an Aurora effect attached will save its parameters in its own metadata.

> ![Screenshot placeholder: The Save dialog with slot selection and name input]

---

## Managing Presets

### 8. The Action Popover (Preset Library)

Click the **<img src="icon.png" width="20" height="20"> Aurora** icon in the top-left extension tray to open the Action popover. This shows your **Preset Library**, a grid of all six preset slots with their names and current values.

From here you can get an overview of everything you've saved, and manage your library without needing to have a map item selected.

> ![Screenshot placeholder: The Action popover showing the Preset Library grid]

### 9. Rename Or Clear Presets *GM-only feature*

At the top of the Preset Library you'll find two mode buttons:

- **Rename**: click it, then click any occupied preset to give it a new name
- **Clear**: click it, then click any occupied preset to empty that slot completely

Both modes highlight the valid targets so you know exactly what you're clicking. Click the same mode button again (or complete the action) to exit the mode.

> ![Screenshot placeholder: Rename mode active with presets highlighted in blue]

---

## Clearing An Aurora Effect

### 10. Reset Or Remove the Effect *GM-only feature*

If you want to zero all of the parameters and start again with this shader, you can use the grey **Reset** button at the foot of the context menu. ⚠️ **Reset has no undo function, so use with care.**

If you want to remove the shader entirely then you can use the red **Remove** button there. If you *accidentally* remove the effect, its most recent parameters are stored on that item so that if you want to Add Aurora again, the new shader will pick up those old parameters - this is a 'soft undo' safeguard. Just remember that you may need to move the item back into the Map layer before you can Add Aurora!

If you just want to temporarily turn the effect off while keeping your slider values intact, use the **Enabled** toggle instead - that way your settings are still there when you switch it back on and you don't need to worry about whether this item is in the Map layer.

> ![Screenshot placeholder: The Reset and Remove buttons at the bottom of the settings panel]

---
## Managing Aurora Effects In-Game

### 11. The Scene Items List *GM-only feature*

In the Action popover, you'll see a section called **Scene Items**, which lists every item that currently has an Aurora effect attached to it, even if that effect is not changing the item's appearance (ie. it's 'zeroed out' and/or currently disabled).

Within this list you can see a thumbnail of each item, its Accessibility name, and its disabled/enabled state. Clicking on the thumbnail or the name will select that item in the Scene, and double-clicking on either of these will select the item and will also move your viewport to make it centred and full-screen.

The disabled/enabled toggle switches are also interactive, allowing you to toggle one or more Aurora effects from this centralised viewpoint, without having to find, select, and open each Aurora item's context menu. This can be very useful during a busy or complex session, but remember to set your item's Accessibility name so that you can distinguish clearly between the different Aurora effects in the list!

---


## Need Help?

If you run into any issues, have a feature request, or just want to share the cool Scenes you've created with Aurora, come find us with your screenshots on Discord (particularly in the #extensions-showcase channel!):

👉 **[Join the Owlbear Rodeo Discord](https://discord.gg/u5RYMkV98s)**

We'd love to hear and see how you're using Aurora at your table. Happy grading! 🎨
